import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import {
  EntitlementKey,
  ErrorCode,
  IllustrationSetStatus,
  NotificationType,
} from '@masalim/types';
import type { CharacterBible, ImageGenerationProvider } from '@masalim/ai';
import type { Prisma } from '@masalim/database';
import type { StorageProvider } from '@masalim/storage';
import { StorageKeys } from '@masalim/storage';
import { PushRoutes } from '@masalim/notifications';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { IMAGE_AI, STORAGE } from '../../providers/providers.module';
import { JobsService } from '../../jobs/jobs.service';
import { QueueName, type QueueJobData } from '../../jobs/queues';
import { NotificationsService } from '../notifications/notifications.service';
import { EntitlementService } from '../subscription/entitlement.service';
import { buildCharacterBible } from './character-bible';

type SetWithStory = Prisma.IllustrationSetGetPayload<{
  include: {
    story: { include: { child: true; pages: true } };
    illustrations: true;
  };
}>;

/**
 * Illustration worker (§26–§27): character-sheet-first. Step 1 renders the
 * character sheet (neutral pose) and stores its provider reference; the cover
 * and every page are then generated with that reference + the verbatim
 * CharacterBible block, which is what keeps the hero visually consistent.
 * Progress advances only when a real image lands in storage.
 */
@Injectable()
export class IllustrationProcessor implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(IllustrationProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
    private readonly entitlements: EntitlementService,
    @Inject(IMAGE_AI) private readonly imageAi: ImageGenerationProvider,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    if (this.env.WORKER_MODE === 'separate') return;
    this.worker = new Worker<QueueJobData>(QueueName.ILLUSTRATION, (job) => this.process(job), {
      connection: this.redis,
      concurrency: 1,
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error({ err: error, aiJobId: job?.data.aiJobId }, 'illustration attempt failed');
    });
  }

  private async process(job: Job<QueueJobData>): Promise<void> {
    const aiJob = await this.prisma.aIJob.findUnique({ where: { id: job.data.aiJobId } });
    if (aiJob == null || aiJob.entityId == null) throw new UnrecoverableError('AIJob row missing');
    const set = await this.prisma.illustrationSet.findUnique({
      where: { id: aiJob.entityId },
      include: {
        story: { include: { child: true, pages: { orderBy: { pageNumber: 'asc' } } } },
        illustrations: true,
      },
    });
    if (set == null || set.story.deletedAt != null) {
      await this.jobs.fail(aiJob.id, ErrorCode.NOT_FOUND, 'Illustration set missing');
      throw new UnrecoverableError('Set missing');
    }

    const payload = (aiJob.payload ?? {}) as { regenerateForIllustrationId?: string };
    if (payload.regenerateForIllustrationId != null) {
      await this.processRegeneration(aiJob.id, set, payload.regenerateForIllustrationId, job);
      return;
    }
    if (set.status === IllustrationSetStatus.READY) {
      await this.jobs.complete(aiJob.id, set.id);
      return;
    }

    await this.jobs.markRunning(aiJob.id, 2);
    await this.prisma.illustrationSet.update({
      where: { id: set.id },
      data: { status: IllustrationSetStatus.GENERATING },
    });

    const bible = buildCharacterBible(set.story, set.story.child);
    const story = set.story;
    const totalUnits = 1 /* character sheet */ + 1 /* cover */ + story.pages.length;
    let doneUnits = 0;
    const tick = async () => {
      doneUnits += 1;
      await this.jobs.setProgress(aiJob.id, Math.round((doneUnits / totalUnits) * 97));
    };

    try {
      // 1. Character sheet → provider reference reused by every later call.
      let characterRef = set.characterReference;
      if (characterRef == null) {
        const sheet = await this.imageAi.generateImage({
          prompt: 'character reference sheet, neutral standing pose, plain warm background',
          style: set.style,
          characterBible: bible,
          quality: 'standard',
          isCharacterSheet: true,
        });
        characterRef = sheet.characterRef ?? null;
        await this.prisma.illustrationSet.update({
          where: { id: set.id },
          data: { characterBible: bible as object, characterReference: characterRef },
        });
      }
      await tick();

      // 2. Cover (skip targets that already exist — retries stay idempotent).
      const existingTargets = new Set(
        set.illustrations.map((item) => item.storyPageId ?? 'cover'),
      );
      if (!existingTargets.has('cover')) {
        const coverPrompt =
          story.coverIllustrationPrompt ??
          `book cover illustration for the story "${story.title}"`;
        await this.renderTarget(set.id, story, null, coverPrompt, set.style, bible, characterRef);
      }
      await tick();

      // 3. Pages in order.
      for (const page of story.pages) {
        if (!existingTargets.has(page.id)) {
          const prompt =
            page.illustrationPrompt ?? `illustration of: ${page.text.slice(0, 240)}`;
          await this.renderTarget(set.id, story, page.id, prompt, set.style, bible, characterRef);
        }
        await tick();
      }

      await this.prisma.illustrationSet.update({
        where: { id: set.id },
        data: { status: IllustrationSetStatus.READY },
      });
      await this.prisma.aIUsageLog.create({
        data: {
          userId: story.userId,
          jobId: aiJob.id,
          provider: this.imageAi.name,
          type: 'ILLUSTRATION_GENERATION',
          success: true,
          units: totalUnits,
        },
      });
      await this.jobs.complete(aiJob.id, set.id);
      await this.notifications.notify(
        story.userId,
        NotificationType.ILLUSTRATIONS_READY,
        { storyTitle: story.title },
        PushRoutes.illustrationsReady(story.id),
        { storyId: story.id, illustrationSetId: set.id },
      );
    } catch (error) {
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isLastAttempt) {
        await this.prisma.illustrationSet.update({
          where: { id: set.id },
          data: { status: IllustrationSetStatus.FAILED },
        });
        await this.entitlements.refundQuota(
          story.userId,
          EntitlementKey.ILLUSTRATION_MONTHLY_LIMIT,
        );
        await this.jobs.fail(
          aiJob.id,
          ErrorCode.ILLUSTRATION_FAILED,
          error instanceof Error ? error.message : 'Illustration generation failed',
        );
      }
      throw error;
    }
  }

  /** Regenerate one page/cover as an unselected alternative inside a READY set. */
  private async processRegeneration(
    aiJobId: string,
    set: SetWithStory,
    targetIllustrationId: string,
    job: Job<QueueJobData>,
  ): Promise<void> {
    const target = set.illustrations.find((item) => item.id === targetIllustrationId);
    if (target == null) {
      await this.jobs.fail(aiJobId, ErrorCode.NOT_FOUND, 'Illustration to regenerate missing');
      throw new UnrecoverableError('Regeneration target missing');
    }
    await this.jobs.markRunning(aiJobId, 20);
    const bible = (set.characterBible ?? buildCharacterBible(set.story, set.story.child)) as
      unknown as CharacterBible;
    try {
      await this.renderTarget(
        set.id,
        set.story,
        target.storyPageId,
        target.prompt,
        set.style,
        bible,
        set.characterReference,
        false,
      );
      await this.jobs.complete(aiJobId, set.id);
    } catch (error) {
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isLastAttempt) {
        await this.jobs.fail(
          aiJobId,
          ErrorCode.ILLUSTRATION_FAILED,
          error instanceof Error ? error.message : 'Regeneration failed',
        );
      }
      throw error;
    }
  }

  private async renderTarget(
    setId: string,
    story: { id: string; userId: string },
    storyPageId: string | null,
    prompt: string,
    style: Parameters<ImageGenerationProvider['generateImage']>[0]['style'],
    bible: CharacterBible,
    characterRef: string | null,
    select = true,
  ): Promise<void> {
    const image = await this.imageAi.generateImage({
      prompt,
      style,
      characterBible: bible,
      characterRef: characterRef ?? undefined,
      quality: 'standard',
    });
    const row = await this.prisma.illustration.create({
      data: {
        illustrationSetId: setId,
        storyPageId,
        imageKey: 'pending',
        prompt,
        selected: false,
      },
    });
    const imageKey = StorageKeys.illustration(story.userId, story.id, row.id);
    await this.storage.putObject(imageKey, image.image, image.contentType);
    await this.prisma.illustration.update({ where: { id: row.id }, data: { imageKey } });
    if (select) {
      // First render of a target becomes the selected image for reader/book.
      if (storyPageId != null) {
        await this.prisma.illustration.update({
          where: { id: row.id },
          data: { selected: true },
        });
        await this.prisma.storyPage.update({
          where: { id: storyPageId },
          data: { illustrationKey: imageKey },
        });
      } else {
        await this.prisma.illustration.update({
          where: { id: row.id },
          data: { selected: true },
        });
        await this.prisma.story.update({
          where: { id: story.id },
          data: { coverImageKey: imageKey },
        });
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
  }
}
