import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import {
  AIJobStatus,
  AIJobType,
  NARRATION_CACHE_RETENTION_DAYS,
  ORPHAN_UPLOAD_GRACE_HOURS,
  VoiceProfileStatus,
} from '@masalim/types';
import type { PushProvider } from '@masalim/notifications';
import { isTransientUploadKey, type StorageProvider } from '@masalim/storage';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PUSH, STORAGE } from '../../providers/providers.module';
import { JobsService } from '../../jobs/jobs.service';
import { QueueName } from '../../jobs/queues';

export const MAINTENANCE_JOBS = {
  HOURLY: 'maintenance-hourly',
  DAILY: 'maintenance-daily',
} as const;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const BATCH_SIZE = 50;

/** Redis list of push tickets awaiting receipt reconciliation (written by the push sender). */
export const PUSH_TICKETS_KEY = 'push:tickets';
/** Expo receipts are available ~15 minutes after a ticket is issued. */
const PUSH_RECEIPT_DELAY_MS = 15 * 60 * 1000;

interface PushTicketEntry {
  ticketId: string;
  token: string;
  at: number;
}

/**
 * Receipt polling is an optional provider capability (Expo has it, the mock
 * does not); typed locally so this worker compiles whether or not the push
 * package already declares it.
 */
type PushProviderWithReceipts = PushProvider & {
  getReceipts?(tickets: Array<{ id: string; token: string }>): Promise<{ deadTokens: string[] }>;
};

export interface SweepSummary {
  deleted: number;
  kept: number;
  failed: number;
}

/**
 * Scheduled housekeeping (one BullMQ scheduler per cadence, no AIJob mirror):
 *  - hourly: expired/revoked auth rows are pruned; push tickets older than the
 *    receipt delay are reconciled and dead device tokens removed;
 *  - daily: client uploads nobody references any more (avatars, voice
 *    recordings) and aged narration chunk caches are deleted from storage;
 *    raw voice recordings past the configured retention are purged.
 * Every step is independent, batched and best-effort per item, and public so
 * tests (and an operator) can run it directly.
 */
@Injectable()
export class MaintenanceProcessor implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MaintenanceProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(PUSH) private readonly push: PushProvider,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.env.WORKER_MODE === 'separate') return;
    this.worker = new Worker(
      QueueName.MAINTENANCE,
      (job: Job) => (job.name === MAINTENANCE_JOBS.DAILY ? this.runDaily() : this.runHourly()),
      { connection: this.redis, concurrency: 1 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error({ err: error, job: job?.name }, 'maintenance run failed');
    });
    // Schedulers are keyed by id, so re-registering on every boot is idempotent.
    const queue = this.jobs.getQueue(QueueName.MAINTENANCE);
    for (const [name, every] of [
      [MAINTENANCE_JOBS.HOURLY, HOUR_MS],
      [MAINTENANCE_JOBS.DAILY, DAY_MS],
    ] as const) {
      await queue
        .upsertJobScheduler(name, { every }, { name, data: {}, opts: { attempts: 1 } })
        .catch((error: unknown) => {
          this.logger.warn({ err: error, name }, 'could not schedule maintenance run');
        });
    }
  }

  async runHourly(): Promise<{
    auth: { refreshTokens: number; passwordResets: number; emailVerifications: number };
    push: { reconciled: number; deadTokens: number };
  }> {
    const auth = await this.pruneAuthRows();
    const push = await this.reconcilePushReceipts();
    this.logger.log({ auth, push }, 'hourly maintenance done');
    return { auth, push };
  }

  async runDaily(): Promise<{ uploads: SweepSummary; voiceRecordings: SweepSummary }> {
    const uploads = await this.sweepOrphanUploads();
    const voiceRecordings = await this.enforceVoiceRawRetention();
    this.logger.log({ uploads, voiceRecordings }, 'daily maintenance done');
    return { uploads, voiceRecordings };
  }

  /**
   * Refresh tokens stay a week past expiry/revocation (reuse detection keeps
   * working for a while after rotation); one-time codes a day past expiry.
   */
  async pruneAuthRows(): Promise<{
    refreshTokens: number;
    passwordResets: number;
    emailVerifications: number;
  }> {
    const now = Date.now();
    const weekAgo = new Date(now - 7 * DAY_MS);
    const dayAgo = new Date(now - DAY_MS);
    const [refreshTokens, passwordResets, emailVerifications] = await Promise.all([
      this.prisma.refreshToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: weekAgo } }, { revokedAt: { lt: weekAgo } }] },
      }),
      this.prisma.passwordReset.deleteMany({ where: { expiresAt: { lt: dayAgo } } }),
      this.prisma.emailVerification.deleteMany({ where: { expiresAt: { lt: dayAgo } } }),
    ]);
    return {
      refreshTokens: refreshTokens.count,
      passwordResets: passwordResets.count,
      emailVerifications: emailVerifications.count,
    };
  }

  /**
   * Push tickets are queued by the sender as JSON `{ticketId, token, at}`;
   * once old enough for a receipt they are checked with the provider and
   * tokens the provider reports dead are dropped. Entries are removed by
   * value, so tickets queued while this runs are never lost.
   */
  async reconcilePushReceipts(): Promise<{ reconciled: number; deadTokens: number }> {
    try {
      const raw = await this.redis.lrange(PUSH_TICKETS_KEY, 0, -1);
      const cutoff = Date.now() - PUSH_RECEIPT_DELAY_MS;
      const due: string[] = [];
      const entries: PushTicketEntry[] = [];
      for (const item of raw) {
        const entry = parseTicket(item);
        if (entry == null) {
          due.push(item); // unreadable — drop it
          continue;
        }
        if (entry.at >= cutoff) continue;
        due.push(item);
        entries.push(entry);
      }
      if (due.length === 0) return { reconciled: 0, deadTokens: 0 };

      let deadTokens: string[] = [];
      const provider = this.push as PushProviderWithReceipts;
      if (entries.length > 0 && typeof provider.getReceipts === 'function') {
        const receipts = await provider.getReceipts(
          entries.map((entry) => ({ id: entry.ticketId, token: entry.token })),
        );
        deadTokens = receipts.deadTokens;
        if (deadTokens.length > 0) {
          await this.prisma.deviceToken.deleteMany({
            where: { expoPushToken: { in: deadTokens } },
          });
        }
      }
      const pipeline = this.redis.pipeline();
      for (const item of due) pipeline.lrem(PUSH_TICKETS_KEY, 1, item);
      await pipeline.exec();
      return { reconciled: entries.length, deadTokens: deadTokens.length };
    } catch (error) {
      this.logger.warn({ err: error }, 'push receipt reconciliation failed');
      return { reconciled: 0, deadTokens: 0 };
    }
  }

  /**
   * Client uploads live under the user prefix before (or without ever) being
   * attached to a row. Everything transient that no row references and that
   * is older than the grace period goes; narration chunk caches go purely by
   * age (they are keyed by content, nothing references them).
   */
  async sweepOrphanUploads(): Promise<SweepSummary> {
    const now = Date.now();
    const uploadCutoff = now - ORPHAN_UPLOAD_GRACE_HOURS * HOUR_MS;
    const cacheCutoff = now - NARRATION_CACHE_RETENTION_DAYS * DAY_MS;
    const referenced = await this.referencedUploadKeys();
    const summary: SweepSummary = { deleted: 0, kept: 0, failed: 0 };

    let batch: string[] = [];
    const flush = async () => {
      const keys = batch;
      batch = [];
      await Promise.all(
        keys.map((key) =>
          this.storage.deleteObject(key).then(
            () => {
              summary.deleted += 1;
            },
            (error: unknown) => {
              summary.failed += 1;
              this.logger.warn({ err: error, key }, 'orphan upload delete failed');
            },
          ),
        ),
      );
    };

    try {
      for await (const entry of this.storage.listObjects('users/')) {
        if (!isTransientUploadKey(entry.key)) continue;
        const isCache = entry.key.includes('/narration-cache/');
        const expired = entry.lastModified.getTime() < (isCache ? cacheCutoff : uploadCutoff);
        if (!expired || (!isCache && referenced.has(entry.key))) {
          summary.kept += 1;
          continue;
        }
        batch.push(entry.key);
        if (batch.length >= BATCH_SIZE) await flush();
      }
      await flush();
    } catch (error) {
      this.logger.warn({ err: error }, 'orphan upload sweep aborted');
    }
    return summary;
  }

  /** Every transient object key some live row (or in-flight clone job) still points at. */
  private async referencedUploadKeys(): Promise<Set<string>> {
    const [users, children, voices, cloneJobs] = await Promise.all([
      this.prisma.user.findMany({
        where: { avatarKey: { not: null } },
        select: { avatarKey: true },
      }),
      this.prisma.child.findMany({
        where: { avatarKey: { not: null }, deletedAt: null },
        select: { avatarKey: true },
      }),
      this.prisma.voiceProfile.findMany({
        where: { recordingKey: { not: null } },
        select: { recordingKey: true },
      }),
      this.prisma.aIJob.findMany({
        where: {
          type: AIJobType.VOICE_CLONE,
          status: { in: [AIJobStatus.QUEUED, AIJobStatus.RUNNING] },
        },
        select: { payload: true },
      }),
    ]);
    const keys = new Set<string>();
    for (const row of users) if (row.avatarKey) keys.add(row.avatarKey);
    for (const row of children) if (row.avatarKey) keys.add(row.avatarKey);
    for (const row of voices) if (row.recordingKey) keys.add(row.recordingKey);
    for (const job of cloneJobs) {
      const key = (job.payload as { recreateRecordingKey?: unknown } | null)?.recreateRecordingKey;
      if (typeof key === 'string') keys.add(key);
    }
    return keys;
  }

  /**
   * Raw voice recordings (§46): with VOICE_RAW_RETENTION_DAYS > 0 the clone
   * worker keeps the recording after a successful clone; this removes it once
   * the retention window has passed (0 = deleted by the worker, nothing to do).
   */
  async enforceVoiceRawRetention(): Promise<SweepSummary> {
    const summary: SweepSummary = { deleted: 0, kept: 0, failed: 0 };
    const days = this.env.VOICE_RAW_RETENTION_DAYS;
    if (days <= 0) return summary;
    const cutoff = new Date(Date.now() - days * DAY_MS);
    const failedIds: string[] = [];
    // Bounded: every successful delete nulls the key, so each query page is new.
    for (let page = 0; page < 20; page++) {
      const rows = await this.prisma.voiceProfile.findMany({
        where: {
          status: VoiceProfileStatus.READY,
          recordingKey: { not: null },
          updatedAt: { lt: cutoff },
          id: { notIn: failedIds },
        },
        select: { id: true, recordingKey: true },
        take: BATCH_SIZE,
      });
      if (rows.length === 0) break;
      for (const row of rows) {
        try {
          await this.storage.deleteObject(row.recordingKey as string);
          await this.prisma.voiceProfile.update({
            where: { id: row.id },
            data: { recordingKey: null },
          });
          summary.deleted += 1;
        } catch (error) {
          failedIds.push(row.id);
          summary.failed += 1;
          this.logger.warn({ err: error, voiceProfileId: row.id }, 'raw recording purge failed');
        }
      }
      if (rows.length < BATCH_SIZE) break;
    }
    return summary;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
  }
}

function parseTicket(raw: string): PushTicketEntry | null {
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof PushTicketEntry, unknown>>;
    if (typeof value.ticketId !== 'string' || typeof value.token !== 'string') return null;
    const at =
      typeof value.at === 'number'
        ? value.at
        : typeof value.at === 'string'
          ? Date.parse(value.at)
          : Number.NaN;
    if (Number.isNaN(at)) return null;
    return { ticketId: value.ticketId, token: value.token, at };
  } catch {
    return null;
  }
}
