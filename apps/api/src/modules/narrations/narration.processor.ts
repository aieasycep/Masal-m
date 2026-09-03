import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { ErrorCode, NarrationStatus, NotificationType } from '@masalim/types';
import type { NarrationDirector, TextToSpeechProvider } from '@masalim/ai';
import type { StorageProvider } from '@masalim/storage';
import { StorageKeys } from '@masalim/storage';
import { PushRoutes } from '@masalim/notifications';
import type { NarrationTiming, NarrationWordTimings } from '@masalim/validation';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { NARRATION_DIRECTOR, STORAGE, TTS } from '../../providers/providers.module';
import { JobsService } from '../../jobs/jobs.service';
import { EntitlementService } from '../subscription/entitlement.service';
import { QueueName, type QueueJobData } from '../../jobs/queues';
import { estimateWordTimings, fullStoryText, wordTimingsFromAlignment } from '../../audio/word-timings';
import { NotificationsService } from '../notifications/notifications.service';
import {
  chunkStoryPages,
  concatAudioChunks,
  type AudioChunkInput,
} from '../../audio/audio-pipeline';

/** Silence between story pages so page turns don't sound rushed. */
const PAGE_TURN_GAP_SECONDS = 1;

/**
 * Narration worker (§19/§6a): sentence-boundary chunks → TTS per chunk →
 * ffmpeg concat (single re-encode) → duration + per-chunk timings (drives the
 * player's "Metni göster" text sync). Progress = real per-chunk milestones.
 */
@Injectable()
export class NarrationProcessor implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(NarrationProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
    @Inject(TTS) private readonly tts: TextToSpeechProvider,
    @Inject(NARRATION_DIRECTOR) private readonly director: NarrationDirector | null,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
    private readonly entitlements: EntitlementService,
  ) {}

  onModuleInit(): void {
    if (this.env.WORKER_MODE === 'separate') return;
    this.worker = new Worker<QueueJobData>(QueueName.NARRATION, (job) => this.process(job), {
      connection: this.redis,
      concurrency: 2,
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error({ err: error, aiJobId: job?.data.aiJobId }, 'narration attempt failed');
    });
  }

  private async process(job: Job<QueueJobData>): Promise<void> {
    const aiJob = await this.prisma.aIJob.findUnique({ where: { id: job.data.aiJobId } });
    if (aiJob == null || aiJob.entityId == null) throw new UnrecoverableError('AIJob row missing');
    const narration = await this.prisma.narration.findUnique({
      where: { id: aiJob.entityId },
      include: {
        story: { include: { pages: { orderBy: { pageNumber: 'asc' } } } },
        voiceProfile: true,
        systemVoice: true,
      },
    });
    if (narration == null || narration.story.deletedAt != null) {
      await this.jobs.fail(aiJob.id, ErrorCode.NOT_FOUND, 'Narration or story missing');
      throw new UnrecoverableError('Narration missing');
    }
    if (narration.status === NarrationStatus.READY) {
      await this.jobs.complete(aiJob.id, narration.id);
      return;
    }

    const providerVoiceId =
      narration.voiceProfile?.providerVoiceId ?? narration.systemVoice?.providerVoiceId;
    if (providerVoiceId == null) {
      await this.finalizeFailure(aiJob.id, narration.id, 'Narrator voice unavailable');
      return;
    }

    await this.jobs.markRunning(aiJob.id, 5);
    await this.prisma.narration.update({
      where: { id: narration.id },
      data: { status: NarrationStatus.PROCESSING, provider: this.tts.name },
    });

    try {
      const language = narration.story.language === 'en' ? 'en' : 'tr';
      const chunks = chunkStoryPages(narration.story.pages);
      if (chunks.length === 0) {
        await this.finalizeFailure(aiJob.id, narration.id, 'Story has no pages');
        return;
      }

      // v3 models act on inline audio tags; the director inserts them per chunk
      // (validated to never alter the story words, degrades to plain text).
      const director =
        this.env.TTS_PROVIDER === 'elevenlabs' && this.env.TTS_MODEL.startsWith('eleven_v3')
          ? this.director
          : null;

      // Breathing room at page turns: silence between the last words of a page
      // and the first words of the next (chunks within one page stay seamless).
      const gapAfter = chunks.map((chunk, index) => {
        const next = chunks[index + 1];
        return next != null && next.pageNumber !== chunk.pageNumber ? PAGE_TURN_GAP_SECONDS : 0;
      });

      const rendered: AudioChunkInput[] = [];
      for (const [index, chunk] of chunks.entries()) {
        const expressiveText =
          director == null ? undefined : await director.annotate(chunk.text, language);
        const speech = await this.tts.generateSpeech({
          text: chunk.text,
          expressiveText: expressiveText !== chunk.text ? expressiveText : undefined,
          providerVoiceId,
          language,
        });
        rendered.push({ ...speech, gapAfterSeconds: gapAfter[index] });
        // 5→80% spread over chunks — every tick is a really synthesized chunk.
        await this.jobs.setProgress(aiJob.id, 5 + Math.round(((index + 1) / chunks.length) * 75));
      }

      const concat = await concatAudioChunks(rendered, this.env.FFMPEG_PATH);
      await this.jobs.setProgress(aiJob.id, 90);

      const timings: NarrationTiming[] = [];
      let cursor = 0;
      for (const [index, chunk] of chunks.entries()) {
        const duration = concat.chunkDurationsSeconds[index] ?? 0;
        timings.push({
          pageNumber: chunk.pageNumber,
          charStart: chunk.charStart,
          charEnd: chunk.charEnd,
          startSeconds: round2(cursor),
          durationSeconds: round2(duration),
        });
        // The page-turn silence shifts everything after it.
        cursor += duration + (gapAfter[index] ?? 0);
      }

      const audioKey = StorageKeys.narrationAudio(
        narration.story.userId,
        narration.storyId,
        narration.id,
      );
      await this.storage.putObject(audioKey, concat.audio, concat.contentType);
      await this.jobs.setProgress(aiJob.id, 93);

      // Karaoke timeline: forced alignment of the FINAL file against the clean
      // story text (audio tags never reach it); any failure degrades to an
      // estimate spread from the measured chunk durations. Never fails the job.
      const wordTimings = await this.buildWordTimings(narration.story.pages, concat, timings);
      await this.jobs.setProgress(aiJob.id, 97);

      await this.prisma.narration.update({
        where: { id: narration.id },
        data: {
          audioKey,
          duration: round2(concat.totalDurationSeconds),
          timings,
          wordTimings: wordTimings ?? undefined,
          status: NarrationStatus.READY,
          error: null,
        },
      });
      await this.jobs.complete(aiJob.id, narration.id);
      await this.notifications.notify(
        narration.story.userId,
        NotificationType.STORY_READY,
        { storyTitle: narration.story.title },
        PushRoutes.storyReady(narration.storyId),
        { storyId: narration.storyId, narrationId: narration.id },
      );
    } catch (error) {
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isLastAttempt) {
        await this.finalizeFailure(
          aiJob.id,
          narration.id,
          error instanceof Error ? error.message : 'TTS failed',
        );
        return;
      }
      throw error;
    }
  }

  private async buildWordTimings(
    pages: Array<{ pageNumber: number; text: string }>,
    concat: { audio: Buffer; contentType: string },
    timings: NarrationTiming[],
  ): Promise<NarrationWordTimings | null> {
    if (this.tts.alignWords != null) {
      try {
        const alignment = await this.tts.alignWords({
          audio: concat.audio,
          contentType: concat.contentType,
          text: fullStoryText(pages),
        });
        const aligned = wordTimingsFromAlignment(pages, alignment);
        if (aligned != null) return aligned;
        this.logger.warn('word alignment too sparse — using estimated timeline');
      } catch (error) {
        this.logger.warn({ err: error }, 'word alignment failed — using estimated timeline');
      }
    }
    return estimateWordTimings(pages, timings);
  }

  private async finalizeFailure(aiJobId: string, narrationId: string, message: string): Promise<void> {
    const row = await this.prisma.narration.update({
      where: { id: narrationId },
      data: { status: NarrationStatus.FAILED, error: message.slice(0, 300) },
      include: { story: { select: { userId: true } } },
    });
    // Extra-narration spends are given back on terminal failure (no-op for
    // the included first narration, which has no spend row).
    await this.entitlements.refundCreditsForRef(row.story.userId, 'narration', narrationId);
    await this.jobs.fail(aiJobId, ErrorCode.TTS_FAILED, message);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
