import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  AIJobType,
  EntitlementKey,
  ErrorCode,
  ModerationStatus,
  StoryStatus,
} from '@masalim/types';
import type { ContentModerator } from '@masalim/ai';
import type { StorageProvider } from '@masalim/storage';
import type {
  CreateStoryInput,
  ListStoriesQuery,
  PaginatedMeta,
  PlaybackPositionInput,
  StoryDetail,
  StorySummary,
  UpdateStoryInput,
} from '@masalim/validation';
import type { Prisma, Story as StoryRow } from '@masalim/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { MODERATOR, STORAGE } from '../../providers/providers.module';
import { JobsService } from '../../jobs/jobs.service';
import { EntitlementService } from '../subscription/entitlement.service';
import { ChildrenService } from '../children/children.service';

type StoryWithRelations = Prisma.StoryGetPayload<{
  include: {
    child: { select: { name: true } };
    favorites: true;
    narrations: {
      include: {
        voiceProfile: { select: { displayName: true } };
        systemVoice: { select: { displayName: true } };
      };
    };
    books: { select: { id: true } };
  };
}>;

const STORY_INCLUDE = {
  child: { select: { name: true } },
  favorites: true,
  narrations: {
    where: { status: 'READY' as const },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: {
      voiceProfile: { select: { displayName: true } },
      systemVoice: { select: { displayName: true } },
    },
  },
  books: { select: { id: true }, where: { deletedAt: null } },
} satisfies Prisma.StoryInclude;

@Injectable()
export class StoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly entitlements: EntitlementService,
    private readonly children: ChildrenService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(MODERATOR) private readonly moderator: ContentModerator,
  ) {}

  /** Two-phase creation (§9a): the wizard payload becomes a DRAFT; generation is a separate call. */
  async create(userId: string, input: CreateStoryInput): Promise<StoryDetail> {
    if (input.childId != null) await this.children.findOwned(userId, input.childId);

    const row = await this.prisma.story.create({
      data: {
        userId,
        childId: input.childId,
        heroName: input.heroName,
        heroType: input.heroType,
        themes: input.themes,
        ageRange: input.ageRange,
        durationTarget: input.durationTarget,
        customPrompt: input.customPrompt,
        educationalGoal: input.educationalGoal,
        advanced: input.advanced,
        language: input.language,
        status: StoryStatus.DRAFT,
      },
      include: STORY_INCLUDE,
    });
    return this.toDetail(userId, row);
  }

  /**
   * Enqueue generation (§16): moderation pre-check on the free-text idea is
   * synchronous (instant friendly rejection); the story quota is consumed
   * here and refunded by the worker on failure. Deterministic queue keys make
   * a double submit return the already-running job.
   */
  async generate(userId: string, storyId: string): Promise<{ jobId: string }> {
    const story = await this.findOwned(userId, storyId);

    if (story.status === StoryStatus.GENERATING) {
      const active = await this.prisma.aIJob.findFirst({
        where: {
          entityId: storyId,
          type: AIJobType.STORY_GENERATION,
          status: { in: ['QUEUED', 'RUNNING'] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (active != null) return { jobId: active.id };
    }
    if (story.status === StoryStatus.READY) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Story is already generated — edit it to create a new version',
        HttpStatus.CONFLICT,
      );
    }

    const idea = [story.customPrompt, story.educationalGoal].filter(Boolean).join(' — ');
    if (idea.length > 0) {
      const verdict = await this.moderator.checkStoryIdea(idea, story.language as 'tr' | 'en');
      if (!verdict.safe) {
        await this.prisma.story.update({
          where: { id: storyId },
          data: { moderationStatus: ModerationStatus.REJECTED },
        });
        throw new AppException(
          ErrorCode.MODERATION_REJECTED,
          'This idea cannot become a child-appropriate story',
          HttpStatus.UNPROCESSABLE_ENTITY,
          { category: verdict.category },
        );
      }
    }

    await this.entitlements.consumeQuota(userId, EntitlementKey.STORY_MONTHLY_LIMIT);
    try {
      await this.prisma.story.update({
        where: { id: storyId },
        data: { status: StoryStatus.GENERATING, moderationStatus: ModerationStatus.PENDING },
      });
      const job = await this.jobs.enqueue({
        userId,
        type: AIJobType.STORY_GENERATION,
        entityId: storyId,
        queueJobId: `story:${storyId}:v${story.version}:gen`,
      });
      return { jobId: job.id };
    } catch (error) {
      await this.entitlements.refundQuota(userId, EntitlementKey.STORY_MONTHLY_LIMIT);
      await this.prisma.story
        .update({ where: { id: storyId }, data: { status: story.status } })
        .catch(() => undefined);
      throw error;
    }
  }

  async list(
    userId: string,
    query: ListStoriesQuery,
  ): Promise<{ items: StorySummary[]; meta: PaginatedMeta }> {
    const where: Prisma.StoryWhereInput = {
      userId,
      deletedAt: null,
      ...(query.childId ? { childId: query.childId } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { heroName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.filter === 'audio' ? { narrations: { some: { status: 'READY' } } } : {}),
      ...(query.filter === 'books' ? { books: { some: { deletedAt: null } } } : {}),
      ...(query.filter === 'favorites' ? { favorites: { some: { userId } } } : {}),
    };

    const orderBy: Prisma.StoryOrderByWithRelationInput =
      query.sort === 'title'
        ? { title: 'asc' }
        : { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' };

    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.story.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: STORY_INCLUDE,
      }),
      this.prisma.story.count({ where }),
    ]);

    return {
      items: await Promise.all(rows.map((row) => this.toSummary(userId, row))),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  async detail(userId: string, storyId: string): Promise<StoryDetail> {
    const row = await this.prisma.story.findFirst({
      where: { id: storyId, deletedAt: null },
      include: STORY_INCLUDE,
    });
    if (row == null) throw AppException.notFound('Story not found');
    if (row.userId !== userId) throw AppException.forbiddenOwnership();
    return this.toDetail(userId, row);
  }

  /**
   * Edit = copy-on-write versioning (§80): the previous state is archived to
   * StoryRevision and `version` bumps, so narrations/illustrations can detect
   * they were produced from an older version.
   */
  async update(userId: string, storyId: string, input: UpdateStoryInput): Promise<StoryDetail> {
    const story = await this.findOwned(userId, storyId);
    if (story.status !== StoryStatus.READY) {
      throw new AppException(
        ErrorCode.STORY_NOT_READY,
        'Only generated stories can be edited',
        HttpStatus.CONFLICT,
      );
    }

    const pages = await this.prisma.storyPage.findMany({
      where: { storyId },
      orderBy: { pageNumber: 'asc' },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.storyRevision.create({
        data: {
          storyId,
          version: story.version,
          title: story.title,
          storyText: story.storyText,
          pages: pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text })),
        },
      });

      if (input.pages != null) {
        for (const page of input.pages) {
          await tx.storyPage.updateMany({
            where: { storyId, pageNumber: page.pageNumber },
            data: { text: page.text },
          });
        }
      }

      const nextPages = await tx.storyPage.findMany({
        where: { storyId },
        orderBy: { pageNumber: 'asc' },
      });
      return tx.story.update({
        where: { id: storyId },
        data: {
          title: input.title ?? undefined,
          storyText: nextPages.map((page) => page.text).join('\n\n'),
          version: { increment: 1 },
        },
        include: STORY_INCLUDE,
      });
    });
    return this.toDetail(userId, updated);
  }

  async remove(userId: string, storyId: string): Promise<void> {
    await this.findOwned(userId, storyId);
    await this.prisma.story.update({
      where: { id: storyId },
      data: { deletedAt: new Date() },
    });
  }

  /** "Kopyasını Oluştur" — a fresh DRAFT with the same wizard inputs. */
  async duplicate(userId: string, storyId: string): Promise<StoryDetail> {
    const story = await this.findOwned(userId, storyId);
    const copy = await this.prisma.story.create({
      data: {
        userId,
        childId: story.childId,
        heroName: story.heroName,
        heroType: story.heroType,
        themes: story.themes,
        ageRange: story.ageRange,
        durationTarget: story.durationTarget,
        customPrompt: story.customPrompt,
        educationalGoal: story.educationalGoal,
        advanced: story.advanced ?? {},
        language: story.language,
        status: StoryStatus.DRAFT,
      },
      include: STORY_INCLUDE,
    });
    return this.toDetail(userId, copy);
  }

  async setFavorite(userId: string, storyId: string, favorite: boolean): Promise<void> {
    await this.findOwned(userId, storyId);
    if (favorite) {
      await this.prisma.favorite.upsert({
        where: { userId_storyId: { userId, storyId } },
        create: { userId, storyId },
        update: {},
      });
    } else {
      await this.prisma.favorite.deleteMany({ where: { userId, storyId } });
    }
  }

  async setPlaybackPosition(
    userId: string,
    storyId: string,
    input: PlaybackPositionInput,
  ): Promise<void> {
    await this.findOwned(userId, storyId);
    const narration = await this.prisma.narration.findFirst({
      where: { id: input.narrationId, storyId },
    });
    if (narration == null) throw AppException.notFound('Narration not found');
    await this.prisma.playbackPosition.upsert({
      where: { userId_storyId: { userId, storyId } },
      create: {
        userId,
        storyId,
        narrationId: input.narrationId,
        positionSeconds: input.positionSeconds,
      },
      update: { narrationId: input.narrationId, positionSeconds: input.positionSeconds },
    });
  }

  /** Ownership policy (§79): single access check for every story route. */
  async findOwned(userId: string, storyId: string): Promise<StoryRow> {
    const row = await this.prisma.story.findFirst({ where: { id: storyId, deletedAt: null } });
    if (row == null) throw AppException.notFound('Story not found');
    if (row.userId !== userId) throw AppException.forbiddenOwnership();
    return row;
  }

  private async toSummary(userId: string, row: StoryWithRelations): Promise<StorySummary> {
    const narration = row.narrations[0] ?? null;
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      childId: row.childId,
      childName: row.child?.name ?? null,
      heroName: row.heroName,
      themes: row.themes,
      durationTarget: row.durationTarget,
      coverImageUrl: row.coverImageKey
        ? await this.storage.getSignedUrl(row.coverImageKey)
        : null,
      isFavorite: row.favorites.some((favorite) => favorite.userId === userId),
      hasBook: row.books.length > 0,
      latestNarration:
        narration == null
          ? null
          : {
              id: narration.id,
              narratorName:
                narration.voiceProfile?.displayName ??
                narration.systemVoice?.displayName ??
                'Masalım',
              isParentVoice: narration.voiceProfileId != null,
              duration: narration.duration,
            },
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async toDetail(userId: string, row: StoryWithRelations): Promise<StoryDetail> {
    const [summary, pages, position] = await Promise.all([
      this.toSummary(userId, row),
      this.prisma.storyPage.findMany({
        where: { storyId: row.id },
        orderBy: { pageNumber: 'asc' },
      }),
      this.prisma.playbackPosition.findUnique({
        where: { userId_storyId: { userId, storyId: row.id } },
      }),
    ]);

    return {
      ...summary,
      ageRange: row.ageRange,
      summary: row.summary,
      storyText: row.storyText,
      moderationStatus: row.moderationStatus,
      version: row.version,
      pages: await Promise.all(
        pages.map(async (page) => ({
          id: page.id,
          pageNumber: page.pageNumber,
          text: page.text,
          illustrationUrl: page.illustrationKey
            ? await this.storage.getSignedUrl(page.illustrationKey)
            : null,
        })),
      ),
      playbackPosition:
        position == null
          ? null
          : { narrationId: position.narrationId, positionSeconds: position.positionSeconds },
    };
  }
}
