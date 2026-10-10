import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import { ErrorCode, OrderStatus } from '@masalim/types';
import type { PrintProvider } from '@masalim/payments';
import type { StorageProvider } from '@masalim/storage';
import type { Env } from '../../config/env';
import type { JobsService } from '../../jobs/jobs.service';
import type { QueueJobData } from '../../jobs/queues';
import type { PrismaService } from '../../prisma/prisma.service';
import { OrderSnapshotProcessor } from './order-snapshot.processor';
import type { OrdersService } from './orders.service';

Logger.overrideLogger(false);

interface OrderState {
  id: string;
  orderNumber: string;
  quantity: number;
  bookSize: string;
  coverType: string;
  status: OrderStatus;
  snapshotReady: boolean;
  printProviderOrderId: string | null;
  bookSnapshot: Record<string, unknown>;
  addressSnapshot: Record<string, string>;
  book: {
    printPdfKey: string | null;
    coverImageKey: string | null;
    pages: Array<{ pageNumber: number; imageKey: string | null }>;
  };
}

function buildProcessor(overrides: Partial<OrderState> = {}) {
  const order: OrderState = {
    id: 'o1',
    orderNumber: 'MSL-20260215-ABC123',
    quantity: 1,
    bookSize: 'SQUARE',
    coverType: 'HARDCOVER',
    status: OrderStatus.PAID,
    snapshotReady: false,
    printProviderOrderId: null,
    bookSnapshot: { title: 'Kitap', pageCount: 1 },
    addressSnapshot: {
      fullName: 'Ayşe Yılmaz',
      phone: '+905551112233',
      addressLine: 'Sokak 1',
      city: 'İstanbul',
      district: 'Kadıköy',
      postalCode: '34000',
    },
    book: {
      printPdfKey: 'users/u1/books/b1/print.pdf',
      coverImageKey: 'users/u1/books/b1/cover.png',
      pages: [{ pageNumber: 1, imageKey: 'users/u1/stories/s1/illustrations/p1.png' }],
    },
    ...overrides,
  };

  const prisma = {
    aIJob: { findUnique: jest.fn(async () => ({ id: 'j1', entityId: 'o1' })) },
    order: {
      findUnique: jest.fn(async () => ({
        ...order,
        book: { ...order.book, pages: [...order.book.pages] },
      })),
      update: jest.fn(async ({ data }: { data: Partial<OrderState> }) => {
        Object.assign(order, data);
        return order;
      }),
    },
  } as unknown as PrismaService;

  const jobs = {
    markRunning: jest.fn(async () => undefined),
    setProgress: jest.fn(async () => undefined),
    complete: jest.fn(async () => undefined),
    fail: jest.fn(async () => undefined),
  };
  const orders = {
    transition: jest.fn(async (id: string, status: OrderStatus, extra: Partial<OrderState>) => {
      order.status = status;
      Object.assign(order, extra);
      return order;
    }),
  };
  const storage = {
    copyObject: jest.fn(async () => undefined),
    getSignedUrl: jest.fn(async (key: string) => `https://signed/${key}`),
  };
  const printProvider = {
    name: 'mock',
    createOrder: jest.fn(),
    getOrder: jest.fn(),
    cancelOrder: jest.fn(),
  };

  const processor = new OrderSnapshotProcessor(
    prisma,
    jobs as unknown as JobsService,
    orders as unknown as OrdersService,
    storage as unknown as StorageProvider,
    printProvider as unknown as PrintProvider,
    {} as Redis,
    { WORKER_MODE: 'inline' } as Env,
  );
  const run = () =>
    (processor as unknown as { process: (job: Job<QueueJobData>) => Promise<void> }).process({
      data: { aiJobId: 'j1' },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job<QueueJobData>);

  return { run, order, jobs, orders, storage, printProvider };
}

describe('OrderSnapshotProcessor — snapshot and print hand-off are independently retryable (D.5)', () => {
  it('a retry after a failed hand-off reuses the stored snapshot instead of re-copying, then hands off', async () => {
    const { run, order, jobs, orders, storage, printProvider } = buildProcessor();
    printProvider.createOrder
      .mockRejectedValueOnce(new Error('print api down'))
      .mockResolvedValueOnce({
        providerOrderId: 'mock-print-1',
        status: 'PENDING',
        trackingNumber: null,
      });

    // Attempt 1: assets copied, snapshot persisted, hand-off throws → job retried.
    await expect(run()).rejects.toThrow('print api down');
    expect(storage.copyObject).toHaveBeenCalledTimes(3);
    expect(order.snapshotReady).toBe(true);
    expect(order.bookSnapshot).toMatchObject({
      title: 'Kitap',
      objects: { 'print.pdf': 'orders/o1/print.pdf', cover: 'orders/o1/cover.png' },
    });
    expect(order.status).toBe(OrderStatus.PAID);
    expect(jobs.complete).not.toHaveBeenCalled();
    expect(jobs.fail).not.toHaveBeenCalled(); // not the last attempt

    // Attempt 2: snapshot skipped, hand-off done from the immutable PDF key.
    await expect(run()).resolves.toBeUndefined();
    expect(storage.copyObject).toHaveBeenCalledTimes(3);
    expect(printProvider.createOrder).toHaveBeenCalledTimes(2);
    expect(printProvider.createOrder).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderNumber: order.orderNumber,
        printPdfUrl: 'https://signed/orders/o1/print.pdf',
        shipping: expect.objectContaining({ country: 'TR', city: 'İstanbul' }),
      }),
    );
    expect(orders.transition).toHaveBeenCalledWith('o1', OrderStatus.IN_PRODUCTION, {
      printProviderOrderId: 'mock-print-1',
    });
    expect(jobs.complete).toHaveBeenCalledWith('j1', 'o1');
  });

  it('completes immediately when both the snapshot and the provider order already exist', async () => {
    const { run, jobs, storage, printProvider } = buildProcessor({
      snapshotReady: true,
      printProviderOrderId: 'mock-print-0',
      bookSnapshot: { objects: { 'print.pdf': 'orders/o1/print.pdf' } },
    });

    await run();

    expect(jobs.markRunning).not.toHaveBeenCalled();
    expect(storage.copyObject).not.toHaveBeenCalled();
    expect(printProvider.createOrder).not.toHaveBeenCalled();
    expect(jobs.complete).toHaveBeenCalledWith('j1', 'o1');
  });

  it('fails the job (no retry) when the snapshot holds no print PDF', async () => {
    const { run, jobs, printProvider } = buildProcessor({
      book: { printPdfKey: null, coverImageKey: 'users/u1/books/b1/cover.png', pages: [] },
    });

    await expect(run()).resolves.toBeUndefined();

    expect(printProvider.createOrder).not.toHaveBeenCalled();
    expect(jobs.fail).toHaveBeenCalledWith(
      'j1',
      ErrorCode.ORDER_CREATION_FAILED,
      'Print PDF missing',
    );
    expect(jobs.complete).not.toHaveBeenCalled();
  });
});
