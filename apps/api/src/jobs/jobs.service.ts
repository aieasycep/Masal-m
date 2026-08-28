import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Queue, JobsOptions } from 'bullmq';
import type Redis from 'ioredis';
import { AIJobStatus, AIJobType, ErrorCode } from '@masalim/types';
import type { AIJob as AIJobDto, JobStreamEvent } from '@masalim/validation';
import type { AIJob as AIJobRow, Prisma } from '@masalim/database';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { REDIS } from '../redis/redis.module';
import { QUEUE_FOR_JOB_TYPE, QueueJobData, QueueName } from './queues';

const JOB_CHANNEL_PREFIX = 'masalim:job-events:';

export function jobChannel(aiJobId: string): string {
  return `${JOB_CHANNEL_PREFIX}${aiJobId}`;
}

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 3000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

/**
 * AIJob lifecycle (§7): every BullMQ job mirrors an AIJob row. Processors
 * report progress here; every update is published on a Redis pub/sub channel
 * so /jobs/:id/stream works across API/worker processes. Progress values are
 * real milestones — never fabricated.
 */
@Injectable()
export class JobsService implements OnApplicationShutdown {
  private readonly logger = new Logger(JobsService.name);
  private readonly queues = new Map<QueueName, Queue>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  getQueue(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (queue == null) {
      queue = new Queue(name, {
        connection: this.redis,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      this.queues.set(name, queue);
    }
    return queue;
  }

  /**
   * Create the AIJob row and enqueue its BullMQ job. `queueJobId` must be
   * deterministic per logical operation (e.g. `story:{id}:v{n}:gen`) so a
   * double submit returns the already-active job instead of duplicating work.
   */
  async enqueue(input: {
    userId: string;
    type: AIJobType;
    entityId: string;
    queueJobId: string;
    payload?: Prisma.InputJsonValue;
  }): Promise<AIJobRow> {
    const existing = await this.prisma.aIJob.findUnique({
      where: { queueJobId: input.queueJobId },
    });
    if (
      existing != null &&
      (existing.status === AIJobStatus.QUEUED || existing.status === AIJobStatus.RUNNING)
    ) {
      return existing;
    }

    // Only the latest job may hold the deterministic key (unique column):
    // release it from a terminal previous run before re-claiming it.
    if (existing != null) {
      await this.prisma.aIJob.update({
        where: { id: existing.id },
        data: { queueJobId: null },
      });
    }
    const row = await this.prisma.aIJob.create({
      data: {
        userId: input.userId,
        type: input.type,
        entityId: input.entityId,
        status: AIJobStatus.QUEUED,
        payload: input.payload ?? {},
        queueJobId: input.queueJobId,
      },
    });

    const queueName = QUEUE_FOR_JOB_TYPE[input.type];
    const data: QueueJobData = { aiJobId: row.id };
    // BullMQ retains terminal jobs for a while, so the queue-level id is the
    // (unique) AIJob row id; concurrent dedupe happens app-level above.
    await this.getQueue(queueName).add(queueName, data, { jobId: row.id });
    return row;
  }

  async getOwned(userId: string, aiJobId: string): Promise<AIJobRow> {
    const row = await this.prisma.aIJob.findUnique({ where: { id: aiJobId } });
    if (row == null) throw AppException.notFound('Job not found');
    if (row.userId !== userId) throw AppException.forbiddenOwnership();
    return row;
  }

  async markRunning(aiJobId: string, progress = 5): Promise<void> {
    await this.update(aiJobId, {
      status: AIJobStatus.RUNNING,
      progress,
      attempts: { increment: 1 },
    });
  }

  async setProgress(aiJobId: string, progress: number): Promise<void> {
    await this.update(aiJobId, { progress: Math.max(0, Math.min(100, Math.round(progress))) });
  }

  async complete(aiJobId: string, resultRef?: string): Promise<void> {
    await this.update(aiJobId, {
      status: AIJobStatus.SUCCEEDED,
      progress: 100,
      resultRef,
      errorCode: null,
      errorMessage: null,
    });
  }

  async fail(aiJobId: string, errorCode: ErrorCode, errorMessage: string): Promise<void> {
    await this.update(aiJobId, {
      status: AIJobStatus.FAILED,
      errorCode,
      errorMessage: errorMessage.slice(0, 500),
    });
  }

  toDto(row: AIJobRow): AIJobDto {
    return {
      id: row.id,
      type: row.type,
      entityId: row.entityId,
      status: row.status,
      progress: row.progress,
      errorCode: row.errorCode,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async update(aiJobId: string, data: Prisma.AIJobUpdateInput): Promise<void> {
    const row = await this.prisma.aIJob.update({ where: { id: aiJobId }, data });
    const event: JobStreamEvent = {
      id: row.id,
      status: row.status,
      progress: row.progress,
      errorCode: row.errorCode,
    };
    await this.redis
      .publish(jobChannel(row.id), JSON.stringify(event))
      .catch((error) => this.logger.warn({ err: error as Error }, 'job event publish failed'));
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close().catch(() => undefined)));
  }
}
