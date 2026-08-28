import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { ErrorCode, OrderStatus } from '@masalim/types';
import type { PrintProvider } from '@masalim/payments';
import type { StorageProvider } from '@masalim/storage';
import { StorageKeys } from '@masalim/storage';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PRINT, STORAGE } from '../../providers/providers.module';
import { JobsService } from '../../jobs/jobs.service';
import { QueueName, type QueueJobData } from '../../jobs/queues';
import { OrdersService } from './orders.service';

/**
 * Order snapshot worker (§81): copies every production asset (print PDF,
 * cover, page images) to the immutable orders/{id}/ prefix — deletion
 * workflows exclude orders/* — then hands the order to the print provider.
 * The snapshot stores object KEYS, never signed URLs.
 */
@Injectable()
export class OrderSnapshotProcessor implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OrderSnapshotProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly orders: OrdersService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(PRINT) private readonly printProvider: PrintProvider,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    if (this.env.WORKER_MODE === 'separate') return;
    this.worker = new Worker<QueueJobData>(
      QueueName.ORDER_SNAPSHOT,
      (job) => this.process(job),
      { connection: this.redis, concurrency: 2 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error({ err: error, aiJobId: job?.data.aiJobId }, 'order snapshot failed');
    });
  }

  private async process(job: Job<QueueJobData>): Promise<void> {
    const aiJob = await this.prisma.aIJob.findUnique({ where: { id: job.data.aiJobId } });
    if (aiJob == null || aiJob.entityId == null) throw new UnrecoverableError('AIJob row missing');
    const order = await this.prisma.order.findUnique({
      where: { id: aiJob.entityId },
      include: { book: { include: { pages: { orderBy: { pageNumber: 'asc' } } } } },
    });
    if (order == null) {
      await this.jobs.fail(aiJob.id, ErrorCode.NOT_FOUND, 'Order missing');
      throw new UnrecoverableError('Order missing');
    }
    if (order.snapshotReady) {
      await this.jobs.complete(aiJob.id, order.id);
      return;
    }

    await this.jobs.markRunning(aiJob.id, 10);
    try {
      const prefix = StorageKeys.orderSnapshot(order.id);
      const sources: Array<{ source: string; name: string }> = [];
      if (order.book.printPdfKey != null) {
        sources.push({ source: order.book.printPdfKey, name: 'print.pdf' });
      }
      if (order.book.coverImageKey != null) {
        sources.push({ source: order.book.coverImageKey, name: 'cover' });
      }
      for (const page of order.book.pages) {
        if (page.imageKey != null) {
          sources.push({ source: page.imageKey, name: `page-${page.pageNumber}` });
        }
      }

      const copied: Record<string, string> = {};
      for (const [index, item] of sources.entries()) {
        const ext = item.source.includes('.') ? item.source.slice(item.source.lastIndexOf('.')) : '';
        const destination = `${prefix}/${item.name}${item.name.includes('.') ? '' : ext}`;
        await this.storage.copyObject(item.source, destination);
        copied[item.name] = destination;
        await this.jobs.setProgress(aiJob.id, 10 + Math.round(((index + 1) / sources.length) * 60));
      }

      const existingSnapshot = (order.bookSnapshot ?? {}) as Record<string, unknown>;
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          bookSnapshot: { ...existingSnapshot, objects: copied },
          snapshotReady: true,
        },
      });
      await this.jobs.setProgress(aiJob.id, 80);

      // Hand off to the print provider using the immutable snapshot PDF.
      const address = order.addressSnapshot as {
        fullName: string; phone: string; addressLine: string;
        city: string; district: string; postalCode: string;
      };
      const pdfKey = copied['print.pdf'];
      if (pdfKey == null) {
        await this.jobs.fail(aiJob.id, ErrorCode.ORDER_CREATION_FAILED, 'Print PDF missing');
        return;
      }
      const printOrder = await this.printProvider.createOrder({
        orderNumber: order.orderNumber,
        quantity: order.quantity,
        bookSize: order.bookSize,
        coverType: order.coverType,
        pageCount: order.book.pages.length,
        printPdfUrl: await this.storage.getSignedUrl(pdfKey, 7 * 24 * 3600),
        shipping: { ...address, country: 'TR' },
      });
      await this.orders.transition(order.id, OrderStatus.IN_PRODUCTION, {
        printProviderOrderId: printOrder.providerOrderId,
      });
      await this.jobs.complete(aiJob.id, order.id);
    } catch (error) {
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isLastAttempt) {
        await this.jobs.fail(
          aiJob.id,
          ErrorCode.ORDER_CREATION_FAILED,
          error instanceof Error ? error.message : 'Snapshot failed',
        );
      }
      throw error;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
  }
}
