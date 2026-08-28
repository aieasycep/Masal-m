import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { UnrecoverableError, Worker, Job } from 'bullmq';
import type Redis from 'ioredis';
import {
  AIJobType,
  EntitlementKey,
  ErrorCode,
  ModerationStatus,
  NotificationType,
  StoryStatus,
} from '@masalim/types';
import {
  StoryGenerationError,
  ContentModerator,
  StoryGenerationInput,
  StoryGenerationProvider,
} from '@masalim/ai';
import { PushRoutes } from '@masalim/notifications';
import type { AIJob as AIJobRow } from '@masalim/database';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { MODERATOR, STORY_AI } from '../../providers/providers.module';
import { JobsService } from '../../jobs/jobs.service';
import { QueueName, QueueJobData } from '../../jobs/queues';
import { NotificationsService } from '../notifications/notifications.service';
import { EntitlementService } from '../subscription/entitlement.service';

/**
 * Story generation worker (§16/§17): prompt → LLM structured output → safety
 * post-check → persist pages → notify. Progress values are real pipeline
 * milestones streamed to the generating screen. Moderation rejections are
 * unrecoverable (no retry); provider failures retry with backoff.
 */
@Injectable()
export class StoryGenerationProcessor implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(StoryGenerationProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
    private readonly entitlements: EntitlementService,
    @Inject(STORY_AI) private readonly storyAi: StoryGenerationProvider,
    @Inject(MODERATOR) private readonly moderator: ContentModerator,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    if (this.env.WORKER_MODE === 'separate') return; // API-only process
    this.worker = new Worker<QueueJobData>(
      QueueName.STORY_GENERATION,
      (job) => this.process(job),
      { connection: this.redis, concurrency: 2 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        { err: error, aiJobId: job?.data.aiJobId },
        'story generation attempt failed',
      );
    });
  }

  private async process(job: Job<QueueJobData>): Promise<void> {
    const aiJob = await this.prisma.aIJob.findUnique({ where: { id: job.data.aiJobId } });
    if (aiJob == null || aiJob.entityId == null) {
      throw new UnrecoverableError('AIJob row missing');
    }
    const story = await this.prisma.story.findUnique({
      where: { id: aiJob.entityId },
      include: { child: true },
    });
    if (story == null || story.deletedAt != null) {
      await this.jobs.fail(aiJob.id, ErrorCode.NOT_FOUND, 'Story was deleted');
      throw new UnrecoverableError('Story missing');
    }
    // Idempotent re-delivery: a finished story never regenerates.
    if (story.status === StoryStatus.READY) {
      await this.jobs.complete(aiJob.id, story.id);
      return;
    }

    await this.jobs.markRunning(aiJob.id, 10);

    try {
      // Variety guard: the prompt shows the child's latest stories so the model
      // diverges from them instead of reusing the same openings and motifs.
      const recentStories = await this.prisma.story.findMany({
        where: {
          userId: story.userId,
          id: { not: story.id },
          status: StoryStatus.READY,
          deletedAt: null,
          ...(story.childId != null ? { childId: story.childId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: { title: true, summary: true },
      });

      const input: StoryGenerationInput = {
        child: story.child
          ? {
              name: story.child.name,
              ageRange: story.child.ageRange,
              interests: story.child.interests,
            }
          : null,
        heroName: story.heroName,
        heroType: story.heroType,
        themes: story.themes,
        ageRange: story.ageRange,
        durationTarget: story.durationTarget,
        customPrompt: story.customPrompt ?? undefined,
        educationalGoal: story.educationalGoal ?? undefined,
        advanced: (story.advanced ?? {}) as StoryGenerationInput['advanced'],
        language: story.language as 'tr' | 'en',
        recentStories,
      };

      const result = await this.storyAi.generateStory(input);
      await this.jobs.setProgress(aiJob.id, 70);

      const fullText = result.story.pages.map((page) => page.text).join('\n\n');
      const verdict = await this.moderator.checkStoryText(fullText, input.language);
      await this.jobs.setProgress(aiJob.id, 85);
      if (!verdict.safe) {
        await this.rejectByModeration(aiJob, story.id, story.userId, verdict.category);
        return;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.storyPage.deleteMany({ where: { storyId: story.id } });
        await tx.storyPage.createMany({
          data: result.story.pages.map((page) => ({
            storyId: story.id,
            pageNumber: page.pageNumber,
            text: page.text,
            illustrationPrompt: page.illustrationPrompt,
          })),
        });
        await tx.story.update({
          where: { id: story.id },
          data: {
            title: result.story.title,
            summary: result.story.summary,
            storyText: fullText,
            coverIllustrationPrompt: result.story.coverIllustrationPrompt,
            status: StoryStatus.READY,
            moderationStatus: ModerationStatus.APPROVED,
          },
        });
      });

      await this.prisma.aIUsageLog.create({
        data: {
          userId: story.userId,
          jobId: aiJob.id,
          provider: this.storyAi.name,
          model: result.usage.model,
          type: AIJobType.STORY_GENERATION,
          success: true,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        },
      });

      await this.jobs.complete(aiJob.id, story.id);
      await this.notifications.notify(
        story.userId,
        NotificationType.STORY_READY,
        { storyTitle: result.story.title },
        PushRoutes.storyReady(story.id),
        { storyId: story.id },
      );
    } catch (error) {
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      const refused =
        error instanceof StoryGenerationError && error.code === 'REFUSED';
      if (refused) {
        await this.rejectByModeration(aiJob, story.id, story.userId, 'refused');
        return;
      }
      if (isLastAttempt) {
        await this.finalizeFailure(aiJob, story.id, story.userId, error);
      }
      throw error;
    }
  }

  private async rejectByModeration(
    aiJob: AIJobRow,
    storyId: string,
    userId: string,
    category: string | undefined,
  ): Promise<void> {
    await this.prisma.story.update({
      where: { id: storyId },
      data: { status: StoryStatus.FAILED, moderationStatus: ModerationStatus.REJECTED },
    });
    await this.entitlements.refundQuota(userId, EntitlementKey.STORY_MONTHLY_LIMIT);
    await this.jobs.fail(
      aiJob.id,
      ErrorCode.MODERATION_REJECTED,
      `Generated content rejected (${category ?? 'unspecified'})`,
    );
  }

  private async finalizeFailure(
    aiJob: AIJobRow,
    storyId: string,
    userId: string,
    error: unknown,
  ): Promise<void> {
    await this.prisma.story.update({
      where: { id: storyId },
      data: { status: StoryStatus.FAILED },
    });
    await this.entitlements.refundQuota(userId, EntitlementKey.STORY_MONTHLY_LIMIT);
    await this.prisma.aIUsageLog.create({
      data: {
        userId,
        jobId: aiJob.id,
        provider: this.storyAi.name,
        type: AIJobType.STORY_GENERATION,
        success: false,
      },
    });
    await this.jobs.fail(
      aiJob.id,
      ErrorCode.STORY_GENERATION_FAILED,
      error instanceof Error ? error.message : 'Story generation failed',
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
  }
}
