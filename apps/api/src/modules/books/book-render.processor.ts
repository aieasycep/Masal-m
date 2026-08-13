import { existsSync } from 'node:fs';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import sharp from 'sharp';
import { chromium, type Browser } from 'playwright-core';
import { BookStatus, ErrorCode, NotificationType } from '@masalim/types';
import type { Prisma } from '@masalim/database';
import type { StorageProvider } from '@masalim/storage';
import { StorageKeys } from '@masalim/storage';
import { PushRoutes } from '@masalim/notifications';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { STORAGE } from '../../providers/providers.module';
import { JobsService } from '../../jobs/jobs.service';
import { QueueName, type QueueJobData } from '../../jobs/queues';
import { NotificationsService } from '../notifications/notifications.service';
import { buildBookHtml, PRINT, type TemplatePage } from './book-template';

type BookWithPages = Prisma.BookGetPayload<{ include: { pages: true } }>;

function chromiumExecutable(configured: string): string | undefined {
  if (configured) return configured;
  const preinstalled = '/opt/pw-browsers/chromium';
  if (existsSync(preinstalled)) return preinstalled;
  return undefined; // let playwright-core resolve its own browsers
}

/**
 * Book render worker (§32/§6a): Chromium prints the self-contained HTML
 * template at exact physical size (206mm = 200 trim + 3mm bleed) with images
 * pre-sized by sharp to true 300 DPI pixels for print. Documented limitation:
 * output is RGB; PDF/X CMYK is a Ghostscript post-process when a real print
 * provider requires it (docs/providers.md).
 */
@Injectable()
export class BookRenderProcessor implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(BookRenderProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    if (this.env.WORKER_MODE === 'separate') return;
    this.worker = new Worker<QueueJobData>(QueueName.BOOK_RENDER, (job) => this.process(job), {
      connection: this.redis,
      concurrency: 1,
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error({ err: error, aiJobId: job?.data.aiJobId }, 'book render attempt failed');
    });
  }

  private async process(job: Job<QueueJobData>): Promise<void> {
    const aiJob = await this.prisma.aIJob.findUnique({ where: { id: job.data.aiJobId } });
    if (aiJob == null || aiJob.entityId == null) throw new UnrecoverableError('AIJob row missing');
    const book = await this.prisma.book.findUnique({
      where: { id: aiJob.entityId },
      include: { pages: { orderBy: { pageNumber: 'asc' } } },
    });
    if (book == null || book.deletedAt != null) {
      await this.jobs.fail(aiJob.id, ErrorCode.NOT_FOUND, 'Book missing');
      throw new UnrecoverableError('Book missing');
    }
    const kind = ((aiJob.payload ?? {}) as { kind?: string }).kind === 'print_pdf'
      ? 'print_pdf'
      : 'digital_preview';

    await this.jobs.markRunning(aiJob.id, 5);
    try {
      const targetPixels = kind === 'print_pdf' ? PRINT.PRINT_PIXELS : PRINT.PREVIEW_PIXELS;
      const pages = await this.composePages(book, targetPixels, async (done, total) => {
        // Image preparation is the bulk of the work: 5→70%.
        await this.jobs.setProgress(aiJob.id, 5 + Math.round((done / total) * 65));
      });

      const html = buildBookHtml(pages);
      const pdf = await this.renderPdf(html);
      await this.jobs.setProgress(aiJob.id, 90);

      const key =
        kind === 'print_pdf'
          ? StorageKeys.bookPdf(book.userId, book.id)
          : StorageKeys.bookPreviewPdf(book.userId, book.id);
      await this.storage.putObject(key, pdf, 'application/pdf');

      await this.prisma.book.update({
        where: { id: book.id },
        data: {
          status: BookStatus.READY,
          ...(kind === 'print_pdf' ? { printPdfKey: key } : {}),
        },
      });
      await this.jobs.complete(aiJob.id, key);
      if (kind === 'print_pdf') {
        await this.notifications.notify(
          book.userId,
          NotificationType.BOOK_READY,
          { storyTitle: book.title },
          PushRoutes.bookReady(book.id),
          { bookId: book.id },
        );
      }
    } catch (error) {
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isLastAttempt) {
        await this.prisma.book.update({
          where: { id: book.id },
          data: { status: BookStatus.DRAFT },
        });
        await this.jobs.fail(
          aiJob.id,
          ErrorCode.BOOK_RENDER_FAILED,
          error instanceof Error ? error.message : 'Book render failed',
        );
      }
      throw error;
    }
  }

  private async composePages(
    book: BookWithPages,
    targetPixels: number,
    onProgress: (done: number, total: number) => Promise<void>,
  ): Promise<TemplatePage[]> {
    const imageKeys = [
      book.coverImageKey,
      ...book.pages.map((page) => page.imageKey),
    ].filter((key): key is string => key != null);
    const total = Math.max(1, imageKeys.length);
    let done = 0;

    const prepared = new Map<string, string>();
    for (const key of imageKeys) {
      if (!prepared.has(key)) {
        const original = await this.storage.getObject(key);
        // Exact physical pixels for the page edge (§6a) — cover fills the full
        // bleed square, page images at least the 58% image band.
        const resized = await sharp(original)
          .resize(targetPixels, targetPixels, { fit: 'cover', position: 'attention' })
          .jpeg({ quality: 88 })
          .toBuffer();
        prepared.set(key, `data:image/jpeg;base64,${resized.toString('base64')}`);
      }
      done += 1;
      await onProgress(done, total);
    }

    const pages: TemplatePage[] = [
      {
        kind: 'cover',
        title: book.title,
        subtitle: book.subtitle ?? undefined,
        imageDataUri: book.coverImageKey ? prepared.get(book.coverImageKey) : undefined,
      },
    ];
    if (book.dedication != null && book.dedication.trim().length > 0) {
      pages.push({ kind: 'dedication', text: book.dedication });
    }
    for (const page of book.pages) {
      pages.push({
        kind: 'story',
        layout: page.layout,
        text: page.text,
        pageNumber: page.pageNumber,
        imageDataUri: page.imageKey ? prepared.get(page.imageKey) : undefined,
      });
    }
    pages.push({ kind: 'back', text: book.backCoverText ?? undefined });
    return pages;
  }

  private async renderPdf(html: string): Promise<Buffer> {
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        executablePath: chromiumExecutable(this.env.CHROMIUM_PATH),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      return await page.pdf({ preferCSSPageSize: true, printBackground: true });
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
  }
}
