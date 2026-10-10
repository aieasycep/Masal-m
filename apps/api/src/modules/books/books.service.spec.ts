import { HttpStatus } from '@nestjs/common';
import { BookStatus, EntitlementKey, ErrorCode } from '@masalim/types';
import type { StorageProvider } from '@masalim/storage';
import { AppException } from '../../common/errors/app.exception';
import type { PrismaService } from '../../prisma/prisma.service';
import type { JobsService } from '../../jobs/jobs.service';
import type { StoriesService } from '../stories/stories.service';
import type { EntitlementService } from '../subscription/entitlement.service';
import { BooksService } from './books.service';

interface BookRow {
  id: string;
  userId: string;
  storyId: string;
  storyVersion: number;
  title: string;
  subtitle: string | null;
  dedication: string | null;
  coverIllustrationId: string | null;
  coverImageKey: string | null;
  coverPalette: string | null;
  backCoverText: string | null;
  status: BookStatus;
  printPdfKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  pages: Array<{
    id: string;
    pageNumber: number;
    storyPageId: string;
    illustrationId: string | null;
    imageKey: string | null;
    text: string;
    layout: 'IMAGE_TOP';
  }>;
}

/**
 * In-memory Prisma fake around one book. `JobsService.enqueue` is faked to
 * behave like the real dedupe: the same `queueJobId` returns the same job.
 * `updatedAt` moves on every write, as `@updatedAt` does.
 */
function buildService(options: { plan?: 'FREE' | 'PREMIUM'; status?: BookStatus } = {}) {
  const book: BookRow = {
    id: 'b1',
    userId: 'u1',
    storyId: 's1',
    storyVersion: 1,
    title: 'Ege ve Ay',
    subtitle: null,
    dedication: null,
    coverIllustrationId: null,
    coverImageKey: null,
    coverPalette: null,
    backCoverText: null,
    status: options.status ?? BookStatus.READY,
    printPdfKey: 'users/u1/books/b1/print.pdf',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    deletedAt: null,
    pages: [
      {
        id: 'bp1',
        pageNumber: 1,
        storyPageId: 'sp1',
        illustrationId: null,
        imageKey: null,
        text: 'Bir varmış.',
        layout: 'IMAGE_TOP',
      },
    ],
  };
  const bookUpdate = jest.fn(async ({ data }: { data: Partial<BookRow> }) => {
    Object.assign(book, data);
    book.updatedAt = new Date(book.updatedAt.getTime() + 1000);
    return book;
  });
  const bookPageUpdate = jest.fn(async () => book.pages[0]);
  const tx = {
    book: { update: bookUpdate },
    bookPage: { update: bookPageUpdate },
    illustration: { findFirst: jest.fn(async () => null) },
  };
  const prisma = {
    book: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === book.id ? { ...book, pages: [...book.pages] } : null,
      ),
      update: bookUpdate,
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
  };

  const jobsByKey = new Map<string, { id: string }>();
  const enqueue = jest.fn(async (input: { queueJobId: string }) => {
    const existing = jobsByKey.get(input.queueJobId);
    if (existing) return existing;
    const created = { id: `job-${jobsByKey.size + 1}` };
    jobsByKey.set(input.queueJobId, created);
    return created;
  });
  const requireFeature = jest.fn(async (_userId: string, key: string) => {
    if ((options.plan ?? 'FREE') === 'FREE') {
      throw new AppException(
        ErrorCode.ENTITLEMENT_REQUIRED,
        `Feature "${key}" requires a premium subscription`,
        HttpStatus.FORBIDDEN,
      );
    }
  });
  const storage = {
    getSignedUrl: jest.fn(async (key: string) => `signed:${key}`),
  } as unknown as StorageProvider;

  const service = new BooksService(
    prisma as unknown as PrismaService,
    { enqueue } as unknown as JobsService,
    {} as StoriesService,
    { requireFeature } as unknown as EntitlementService,
    storage,
  );
  return { service, book, enqueue, requireFeature, bookUpdate, bookPageUpdate };
}

describe('BooksService.render', () => {
  it('a double tap joins the same job: the queue key is per (book, kind), not per updatedAt', async () => {
    const { service, enqueue, book } = buildService({ plan: 'PREMIUM' });

    const first = await service.render('u1', 'b1', { kind: 'print_pdf' });
    const second = await service.render('u1', 'b1', { kind: 'print_pdf' });

    expect(second.jobId).toBe(first.jobId);
    expect(enqueue).toHaveBeenCalledTimes(2);
    const keys = enqueue.mock.calls.map(([input]) => input.queueJobId);
    expect(keys[0]).toBe('book:b1:render:print_pdf');
    expect(keys[1]).toBe(keys[0]);
    expect(book.status).toBe(BookStatus.RENDERING);
  });

  it('restores the previous status when the enqueue throws', async () => {
    const { service, enqueue, book } = buildService({ plan: 'PREMIUM', status: BookStatus.READY });
    enqueue.mockRejectedValueOnce(new Error('redis gone'));

    await expect(service.render('u1', 'b1', { kind: 'digital_preview' })).rejects.toThrow(
      'redis gone',
    );

    expect(book.status).toBe(BookStatus.READY);
  });

  it('gates the print PDF on the premium hd_book_export entitlement before touching the book', async () => {
    const { service, enqueue, requireFeature, book, bookUpdate } = buildService({ plan: 'FREE' });

    await expect(service.render('u1', 'b1', { kind: 'print_pdf' })).rejects.toMatchObject({
      code: ErrorCode.ENTITLEMENT_REQUIRED,
    });

    expect(requireFeature).toHaveBeenCalledWith('u1', EntitlementKey.HD_BOOK_EXPORT);
    expect(bookUpdate).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(book.status).toBe(BookStatus.READY);
  });

  it('keeps the digital preview free', async () => {
    const { service, requireFeature } = buildService({ plan: 'FREE' });

    const result = await service.render('u1', 'b1', { kind: 'digital_preview' });

    expect(result.jobId).toBe('job-1');
    expect(requireFeature).not.toHaveBeenCalled();
  });

  it('rejects a foreign book before any gate', async () => {
    const { service, requireFeature } = buildService({ plan: 'FREE' });

    await expect(service.render('u2', 'b1', { kind: 'print_pdf' })).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN_OWNERSHIP,
    });
    expect(requireFeature).not.toHaveBeenCalled();
  });
});

describe('BooksService.update', () => {
  it('invalidates the rendered print file and returns the book to DRAFT', async () => {
    const { service, book } = buildService({ plan: 'PREMIUM', status: BookStatus.READY });

    const updated = await service.update('u1', 'b1', { title: 'Yeni Başlık' });

    expect(book.title).toBe('Yeni Başlık');
    expect(book.printPdfKey).toBeNull();
    expect(book.status).toBe(BookStatus.DRAFT);
    expect(updated.printPdfUrl).toBeNull();
    expect(updated.status).toBe(BookStatus.DRAFT);
  });
});
