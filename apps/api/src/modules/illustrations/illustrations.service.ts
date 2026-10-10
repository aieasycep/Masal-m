import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  AIJobType,
  CreditReason,
  ErrorCode,
  EXTRA_ACTION_CREDIT_COSTS,
  ILLUSTRATION_REGENERATE_CREDIT_COST,
  IllustrationSetStatus,
  StoryStatus,
} from '@masalim/types';
import type { StorageProvider } from '@masalim/storage';
import type {
  CreateIllustrationSetInput,
  Illustration as IllustrationDto,
  IllustrationSet as IllustrationSetDto,
} from '@masalim/validation';
import type { Prisma } from '@masalim/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { STORAGE } from '../../providers/providers.module';
import { JobsService } from '../../jobs/jobs.service';
import { EntitlementService } from '../subscription/entitlement.service';
import { StoriesService } from '../stories/stories.service';

/** Ledger ref type for per-attempt regenerate spends (refId = `${illustrationId}:${uuid}`). */
export const REGENERATE_CREDIT_REF_TYPE = 'illustration_regen';

/**
 * Placeholder imageKey of rows older worker builds created before uploading;
 * the processor deletes them on its next attempt — never show them meanwhile.
 */
const PENDING_IMAGE_KEY = 'pending';

type SetWithIllustrations = Prisma.IllustrationSetGetPayload<{
  include: { illustrations: true };
}>;

@Injectable()
export class IllustrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly entitlements: EntitlementService,
    private readonly stories: StoriesService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  async list(userId: string, storyId: string): Promise<IllustrationSetDto[]> {
    const story = await this.stories.findOwned(userId, storyId);
    const sets = await this.prisma.illustrationSet.findMany({
      where: { storyId },
      orderBy: { createdAt: 'desc' },
      include: { illustrations: { orderBy: { createdAt: 'asc' } } },
    });
    const pageCount = await this.prisma.storyPage.count({ where: { storyId } });
    return Promise.all(sets.map((set) => this.toDto(set, pageCount, story.userId)));
  }

  /**
   * Enqueue an illustration set (§26–§27): quota-gated, one active set per
   * (story version, style) — resubmits return the active/ready set.
   */
  async create(
    userId: string,
    storyId: string,
    input: CreateIllustrationSetInput,
  ): Promise<{ set: IllustrationSetDto; jobId: string | null }> {
    const story = await this.stories.findOwned(userId, storyId);
    if (story.status !== StoryStatus.READY) {
      throw new AppException(
        ErrorCode.STORY_NOT_READY,
        'Story must be generated before illustrating',
        HttpStatus.CONFLICT,
      );
    }
    const pageCount = await this.prisma.storyPage.count({ where: { storyId } });

    const existing = await this.prisma.illustrationSet.findFirst({
      where: {
        storyId,
        storyVersion: story.version,
        style: input.style,
        status: { in: ['QUEUED', 'GENERATING', 'READY'] },
      },
      include: { illustrations: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing != null) {
      const activeJob = await this.activeJobFor(existing.id);
      return {
        set: await this.toDto(existing, pageCount, userId),
        jobId: activeJob,
      };
    }

    // The story's FIRST illustration set is included in its story credits ONCE
    // per story, not per version (a title edit must not reset the allowance);
    // every further set costs half the story price. Count + insert run under a
    // per-story advisory lock so concurrent requests cannot both come out free.
    const { set, creditCost } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${storyId}))`;
      const priorSets = await tx.illustrationSet.count({
        where: {
          storyId,
          status: { in: ['QUEUED', 'GENERATING', 'READY'] },
        },
      });
      const created = await tx.illustrationSet.create({
        data: {
          storyId,
          storyVersion: story.version,
          style: input.style,
          status: IllustrationSetStatus.QUEUED,
        },
        include: { illustrations: true },
      });
      return {
        set: created,
        creditCost: priorSets === 0 ? 0 : EXTRA_ACTION_CREDIT_COSTS[story.durationTarget],
      };
    });
    if (creditCost > 0) {
      try {
        await this.entitlements.consumeCredits(
          userId,
          creditCost,
          CreditReason.EXTRA_ILLUSTRATION_SPEND,
          { type: 'illustration_set', id: set.id },
        );
      } catch (error) {
        await this.prisma.illustrationSet.delete({ where: { id: set.id } }).catch(() => undefined);
        throw error;
      }
    }
    try {
      const job = await this.jobs.enqueue({
        userId,
        type: AIJobType.ILLUSTRATION_GENERATION,
        entityId: set.id,
        queueJobId: `illust:${set.id}`,
      });
      return { set: await this.toDto(set, pageCount, userId), jobId: job.id };
    } catch (error) {
      await this.entitlements.refundCreditsForRef(userId, 'illustration_set', set.id);
      await this.prisma.illustrationSet.delete({ where: { id: set.id } }).catch(() => undefined);
      throw error;
    }
  }

  /** "Alternatif görsel seç": mark selected + point the story page (or cover) at it. */
  async select(userId: string, illustrationId: string): Promise<IllustrationDto> {
    const illustration = await this.findOwnedIllustration(userId, illustrationId);
    await this.prisma.$transaction(async (tx) => {
      await tx.illustration.updateMany({
        where: {
          illustrationSetId: illustration.illustrationSetId,
          storyPageId: illustration.storyPageId ?? null,
        },
        data: { selected: false },
      });
      await tx.illustration.update({
        where: { id: illustrationId },
        data: { selected: true },
      });
      if (illustration.storyPageId != null) {
        await tx.storyPage.update({
          where: { id: illustration.storyPageId },
          data: { illustrationKey: illustration.imageKey },
        });
      } else {
        await tx.story.update({
          where: { id: illustration.illustrationSet.storyId },
          data: { coverImageKey: illustration.imageKey },
        });
      }
    });
    return this.illustrationDto({ ...illustration, selected: true });
  }

  /**
   * Regenerate one target (page or cover) as a new unselected alternative.
   * Every regenerate is a metered render: one credit is taken up front
   * (INSUFFICIENT_CREDITS stops it here, before any job exists) and refunded
   * only if the job cannot be queued or terminally fails in the processor.
   */
  async regenerate(userId: string, illustrationId: string): Promise<{ jobId: string }> {
    const illustration = await this.findOwnedIllustration(userId, illustrationId);
    if (illustration.illustrationSet.status !== IllustrationSetStatus.READY) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Set is still generating',
        HttpStatus.CONFLICT,
      );
    }
    // One ledger ref per regenerate — the same illustration can be redone many
    // times, and each spend must be refundable on its own (uuid, not a
    // timestamp: two taps in the same millisecond must never share a job id).
    const creditRefId = `${illustrationId}:${randomUUID()}`;
    await this.entitlements.consumeCredits(
      userId,
      ILLUSTRATION_REGENERATE_CREDIT_COST,
      CreditReason.EXTRA_ILLUSTRATION_SPEND,
      { type: REGENERATE_CREDIT_REF_TYPE, id: creditRefId },
    );
    try {
      const job = await this.jobs.enqueue({
        userId,
        type: AIJobType.ILLUSTRATION_GENERATION,
        entityId: illustration.illustrationSetId,
        queueJobId: `illust:${illustration.illustrationSetId}:regen:${creditRefId}`,
        payload: { regenerateForIllustrationId: illustrationId, creditRefId },
      });
      return { jobId: job.id };
    } catch (error) {
      await this.entitlements.refundCreditsForRef(userId, REGENERATE_CREDIT_REF_TYPE, creditRefId);
      throw error;
    }
  }

  private async activeJobFor(setId: string): Promise<string | null> {
    const job = await this.prisma.aIJob.findFirst({
      where: {
        entityId: setId,
        type: AIJobType.ILLUSTRATION_GENERATION,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return job?.id ?? null;
  }

  private async findOwnedIllustration(userId: string, illustrationId: string) {
    const row = await this.prisma.illustration.findUnique({
      where: { id: illustrationId },
      include: { illustrationSet: { include: { story: { select: { userId: true } } } } },
    });
    if (row == null) throw AppException.notFound('Illustration not found');
    if (row.illustrationSet.story.userId !== userId) throw AppException.forbiddenOwnership();
    return row;
  }

  private async toDto(
    set: SetWithIllustrations,
    pageCount: number,
    _userId: string,
  ): Promise<IllustrationSetDto> {
    const items = set.illustrations.filter((item) => item.imageKey !== PENDING_IMAGE_KEY);
    const targetsDone = new Set(items.map((item) => item.storyPageId ?? 'cover')).size;
    return {
      id: set.id,
      storyId: set.storyId,
      storyVersion: set.storyVersion,
      style: set.style,
      status: set.status,
      progress: { completed: targetsDone, total: pageCount + 1 },
      illustrations: await Promise.all(items.map((item) => this.illustrationDto(item))),
      createdAt: set.createdAt.toISOString(),
      jobId: await this.activeJobFor(set.id),
    };
  }

  private async illustrationDto(item: {
    id: string;
    storyPageId: string | null;
    imageKey: string;
    selected: boolean;
    createdAt: Date;
  }): Promise<IllustrationDto> {
    return {
      id: item.id,
      storyPageId: item.storyPageId,
      isCover: item.storyPageId == null,
      imageUrl: await this.storage.getSignedUrl(item.imageKey),
      selected: item.selected,
      createdAt: item.createdAt.toISOString(),
    };
  }
}
