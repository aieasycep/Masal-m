import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { AIJobType, DeletionStatus } from '@masalim/types';
import type { VoiceCloneProvider } from '@masalim/ai';
import { StorageKeys, type StorageProvider } from '@masalim/storage';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { STORAGE, VOICE_CLONE } from '../../providers/providers.module';
import { JobsService } from '../../jobs/jobs.service';
import { QueueName, type QueueJobData } from '../../jobs/queues';

const SWEEP_JOB_NAME = 'deletion-sweep';
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Account deletion worker (§81/§84, KVKK). A deletion request becomes
 * effective after the grace period; an hourly sweep enqueues one job per due
 * request and this worker purges the account:
 *  - provider voice clones are deleted at ElevenLabs,
 *  - every object under `users/{id}/` is removed from storage (order
 *    snapshots live under `orders/` and are kept on purpose),
 *  - personal content rows are deleted; the User row itself is anonymized
 *    rather than removed so orders, the credit ledger and usage logs keep
 *    their accounting references. Stories that back an ordered book are only
 *    soft-deleted for the same reason.
 * Signing in during the grace period cancels the request, so a request that
 * is no longer PENDING when the job runs is a no-op.
 */
@Injectable()
export class AccountDeletionProcessor implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AccountDeletionProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    @Inject(VOICE_CLONE) private readonly voiceClone: VoiceCloneProvider,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.env.WORKER_MODE === 'separate') return;
    this.worker = new Worker<QueueJobData & { sweep?: boolean }>(
      QueueName.DELETION,
      (job) => (job.name === SWEEP_JOB_NAME ? this.sweep() : this.process(job)),
      { connection: this.redis, concurrency: 1 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        { err: error, aiJobId: job?.data.aiJobId },
        'account deletion attempt failed',
      );
    });
    // A job scheduler is keyed by id, so re-registering on every boot is idempotent.
    await this.jobs
      .getQueue(QueueName.DELETION)
      .upsertJobScheduler(
        SWEEP_JOB_NAME,
        { every: SWEEP_INTERVAL_MS },
        { name: SWEEP_JOB_NAME, data: { aiJobId: '', sweep: true }, opts: { attempts: 1 } },
      )
      .catch((error: unknown) => {
        this.logger.warn({ err: error }, 'could not schedule the deletion sweep');
      });
  }

  /** Enqueue a purge job for every deletion request whose grace period ended. */
  async sweep(): Promise<number> {
    const due = await this.prisma.deletionRequest.findMany({
      where: { scope: 'ACCOUNT', status: DeletionStatus.PENDING, effectiveAt: { lte: new Date() } },
      select: { userId: true },
    });
    for (const request of due) {
      await this.jobs.enqueue({
        userId: request.userId,
        type: AIJobType.ACCOUNT_DELETION,
        entityId: request.userId,
        queueJobId: `deletion:${request.userId}`,
      });
    }
    if (due.length > 0) this.logger.log(`deletion sweep enqueued ${due.length} account purge(s)`);
    await this.retryOrphanedProviderVoices();
    return due.length;
  }

  /**
   * Voice profiles deleted while the provider call failed keep their provider
   * id; retry those deletes so orphaned clones do not occupy voice slots.
   */
  async retryOrphanedProviderVoices(): Promise<number> {
    const orphans = await this.prisma.voiceProfile.findMany({
      where: { deletedAt: { not: null }, providerVoiceId: { not: null } },
      select: { id: true, providerVoiceId: true },
      take: 50,
    });
    let cleaned = 0;
    for (const voice of orphans) {
      const ok = await this.voiceClone.deleteVoice(voice.providerVoiceId as string).then(
        () => true,
        (error: unknown) => {
          this.logger.warn(
            { err: error, voiceProfileId: voice.id },
            'provider voice delete retry failed',
          );
          return false;
        },
      );
      if (ok) {
        await this.prisma.voiceProfile.update({
          where: { id: voice.id },
          data: { providerVoiceId: null },
        });
        cleaned += 1;
      }
    }
    if (cleaned > 0) this.logger.log(`removed ${cleaned} orphaned provider voice(s)`);
    return cleaned;
  }

  private async process(job: Job<QueueJobData>): Promise<void> {
    const aiJob = await this.prisma.aIJob.findUnique({ where: { id: job.data.aiJobId } });
    if (aiJob == null || aiJob.entityId == null) throw new UnrecoverableError('AIJob row missing');
    await this.jobs.markRunning(aiJob.id);
    const outcome = await this.purge(aiJob.entityId);
    await this.jobs.complete(aiJob.id, outcome);
  }

  /**
   * Purge one account. Returns 'skipped' when the request was cancelled (or
   * already handled) in the meantime, 'purged' otherwise.
   */
  async purge(userId: string): Promise<'skipped' | 'purged'> {
    const request = await this.prisma.deletionRequest.findFirst({
      where: {
        userId,
        scope: 'ACCOUNT',
        status: DeletionStatus.PENDING,
        effectiveAt: { lte: new Date() },
      },
    });
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (request == null || user == null || user.deletedAt == null) {
      this.logger.log({ userId }, 'deletion request no longer pending — nothing to purge');
      return 'skipped';
    }
    await this.prisma.deletionRequest.update({
      where: { id: request.id },
      data: { status: DeletionStatus.PROCESSING },
    });

    // 1. Provider-side voice clones (best effort; the profile rows go below).
    const voices = await this.prisma.voiceProfile.findMany({
      where: { userId, providerVoiceId: { not: null } },
      select: { id: true, providerVoiceId: true },
    });
    for (const voice of voices) {
      await this.voiceClone.deleteVoice(voice.providerVoiceId as string).catch((error: unknown) => {
        this.logger.warn({ err: error, voiceProfileId: voice.id }, 'provider voice delete failed');
      });
    }

    // 2. Every stored object of the user (recordings, narrations, images, PDFs).
    await this.storage.deletePrefix(StorageKeys.userPrefix(userId));

    // 3. Rows. Stories behind an ordered book keep the FK chain alive and are
    //    soft-deleted; everything else cascades from the story/child rows.
    const orderedStoryIds = (
      await this.prisma.book.findMany({
        where: { userId, orders: { some: {} } },
        select: { storyId: true },
      })
    ).map((book) => book.storyId);
    const anonymizedEmail = `deleted-${userId}@anonymized.masalim.app`;
    await this.prisma.$transaction([
      this.prisma.story.deleteMany({ where: { userId, id: { notIn: orderedStoryIds } } }),
      this.prisma.story.updateMany({
        where: { userId, id: { in: orderedStoryIds } },
        data: { deletedAt: new Date(), title: 'Silinmiş masal', storyText: null, summary: null },
      }),
      this.prisma.child.deleteMany({ where: { userId } }),
      this.prisma.voiceProfile.deleteMany({ where: { userId } }),
      this.prisma.address.deleteMany({ where: { userId } }),
      this.prisma.deviceToken.deleteMany({ where: { userId } }),
      this.prisma.notification.deleteMany({ where: { userId } }),
      this.prisma.playbackPosition.deleteMany({ where: { userId } }),
      this.prisma.favorite.deleteMany({ where: { userId } }),
      this.prisma.passwordReset.deleteMany({ where: { userId } }),
      this.prisma.emailVerification.deleteMany({ where: { userId } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.authIdentity.deleteMany({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: anonymizedEmail,
          name: 'Silinmiş kullanıcı',
          passwordHash: null,
          avatarKey: null,
          timezone: null,
          notificationPrefs: {},
          creditBalance: 0,
        },
      }),
      this.prisma.deletionRequest.update({
        where: { id: request.id },
        data: { status: DeletionStatus.COMPLETED, completedAt: new Date() },
      }),
    ]);
    this.logger.log({ userId }, 'account purged');
    return 'purged';
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
  }
}
