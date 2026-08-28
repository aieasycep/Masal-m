import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { ErrorCode, NotificationType, VoiceProfileStatus } from '@masalim/types';
import type { TextToSpeechProvider, VoiceCloneProvider } from '@masalim/ai';
import type { StorageProvider } from '@masalim/storage';
import { StorageKeys } from '@masalim/storage';
import { PushRoutes } from '@masalim/notifications';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { STORAGE, TTS, VOICE_CLONE } from '../../providers/providers.module';
import { JobsService } from '../../jobs/jobs.service';
import { QueueName, type QueueJobData } from '../../jobs/queues';
import { NotificationsService } from '../notifications/notifications.service';

const PREVIEW_TEXT: Record<'tr' | 'en', string> = {
  tr: 'Bir varmış bir yokmuş… Bu ses artık senin masallarını anlatacak.',
  en: 'Once upon a time… This voice will now tell your stories.',
};

/**
 * Voice clone worker (§20–§21/§46): recording → provider clone → preview clip
 * → raw-recording retention. A failed clone preserves the uploaded recording
 * ("Kaydın güvende") and never destroys a previously working clone during
 * re-record — the swap happens only after the new clone succeeds.
 */
@Injectable()
export class VoiceCloneProcessor implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(VoiceCloneProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
    @Inject(VOICE_CLONE) private readonly voiceClone: VoiceCloneProvider,
    @Inject(TTS) private readonly tts: TextToSpeechProvider,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    if (this.env.WORKER_MODE === 'separate') return;
    this.worker = new Worker<QueueJobData>(QueueName.VOICE_CLONE, (job) => this.process(job), {
      connection: this.redis,
      concurrency: 2,
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error({ err: error, aiJobId: job?.data.aiJobId }, 'voice clone attempt failed');
    });
  }

  private async process(job: Job<QueueJobData>): Promise<void> {
    const aiJob = await this.prisma.aIJob.findUnique({ where: { id: job.data.aiJobId } });
    if (aiJob == null || aiJob.entityId == null) throw new UnrecoverableError('AIJob row missing');
    const profile = await this.prisma.voiceProfile.findUnique({
      where: { id: aiJob.entityId },
      include: { user: { select: { locale: true } } },
    });
    if (profile == null || profile.deletedAt != null) {
      await this.jobs.fail(aiJob.id, ErrorCode.NOT_FOUND, 'Voice profile was deleted');
      throw new UnrecoverableError('Voice profile missing');
    }

    const payload = (aiJob.payload ?? {}) as { recreateRecordingKey?: string };
    const isRecreate = payload.recreateRecordingKey != null;
    const recordingKey = payload.recreateRecordingKey ?? profile.recordingKey;
    if (recordingKey == null) {
      await this.jobs.fail(aiJob.id, ErrorCode.VOICE_PROCESSING_FAILED, 'Recording missing');
      throw new UnrecoverableError('Recording key missing');
    }

    await this.jobs.markRunning(aiJob.id, 10);
    if (!isRecreate) {
      await this.prisma.voiceProfile.update({
        where: { id: profile.id },
        data: { status: VoiceProfileStatus.PROCESSING, processingError: null },
      });
    }

    const language = profile.user.locale === 'en' ? 'en' : 'tr';
    try {
      const recording = await this.storage.getObject(recordingKey);
      await this.jobs.setProgress(aiJob.id, 30);

      const { providerVoiceId } = await this.voiceClone.createVoice({
        displayName: profile.displayName,
        audio: recording,
        contentType: guessAudioContentType(recordingKey),
        language,
      });
      await this.jobs.setProgress(aiJob.id, 65);

      const preview = await this.tts.generateSpeech({
        text: PREVIEW_TEXT[language],
        providerVoiceId,
        language,
      });
      const previewKey = StorageKeys.voicePreview(profile.userId, profile.id);
      await this.storage.putObject(previewKey, preview.audio, preview.contentType);
      await this.jobs.setProgress(aiJob.id, 85);

      const previousProviderVoiceId = profile.providerVoiceId;
      const previousRecordingKey = profile.recordingKey;

      await this.prisma.voiceProfile.update({
        where: { id: profile.id },
        data: {
          provider: this.voiceClone.name,
          providerVoiceId,
          recordingKey,
          previewKey,
          status: VoiceProfileStatus.READY,
          processingError: null,
        },
      });

      // Retire the old clone only after the new one is live (§46).
      if (isRecreate && previousProviderVoiceId != null && previousProviderVoiceId !== providerVoiceId) {
        await this.voiceClone.deleteVoice(previousProviderVoiceId).catch(() => undefined);
      }
      if (isRecreate && previousRecordingKey != null && previousRecordingKey !== recordingKey) {
        await this.storage.deleteObject(previousRecordingKey).catch(() => undefined);
      }
      // Raw-recording retention (§46): default 0 = delete once clone + preview are live.
      if (this.env.VOICE_RAW_RETENTION_DAYS === 0) {
        await this.storage.deleteObject(recordingKey).catch(() => undefined);
        await this.prisma.voiceProfile.update({
          where: { id: profile.id },
          data: { recordingKey: null },
        });
      }

      await this.jobs.complete(aiJob.id, profile.id);
      await this.notifications.notify(
        profile.userId,
        NotificationType.VOICE_READY,
        { voiceName: profile.displayName },
        PushRoutes.voiceReady(),
        { voiceProfileId: profile.id },
      );
    } catch (error) {
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isLastAttempt) {
        // Keep the recording so the user can retry without re-reading (§20).
        await this.prisma.voiceProfile.update({
          where: { id: profile.id },
          data: {
            status: isRecreate ? VoiceProfileStatus.READY : VoiceProfileStatus.FAILED,
            processingError: error instanceof Error ? error.message.slice(0, 300) : 'clone failed',
          },
        });
        await this.jobs.fail(
          aiJob.id,
          ErrorCode.VOICE_PROCESSING_FAILED,
          error instanceof Error ? error.message : 'Voice processing failed',
        );
      }
      throw error;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
  }
}

function guessAudioContentType(key: string): string {
  if (key.endsWith('.wav')) return 'audio/wav';
  if (key.endsWith('.mp3')) return 'audio/mpeg';
  return 'audio/mp4';
}
