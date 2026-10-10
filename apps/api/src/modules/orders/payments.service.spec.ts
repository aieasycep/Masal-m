import { HttpStatus, Logger } from '@nestjs/common';
import { ErrorCode, OrderStatus, PaymentStatus } from '@masalim/types';
import { Prisma } from '@masalim/database';
import type { PaymentProvider, VerifyPaymentResult } from '@masalim/payments';
import { AppException } from '../../common/errors/app.exception';
import type { Env } from '../../config/env';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';

// The mismatch path logs at error level; keep the test output clean.
Logger.overrideLogger(false);

interface PaymentRow {
  id: string;
  orderId: string;
  provider: string;
  providerPaymentId: string | null;
  amount: Prisma.Decimal;
  status: PaymentStatus;
  rawResponse: Record<string, unknown> | null;
  idempotencyKey: string;
}

const address = {
  fullName: 'Ayşe Yılmaz',
  phone: '+905551112233',
  addressLine: 'Sokak 1',
  city: 'İstanbul',
  district: 'Kadıköy',
  postalCode: '34000',
};

function order(id: string, userId: string) {
  return {
    id,
    userId,
    orderNumber: `MSL-${id}`,
    status: OrderStatus.PENDING,
    total: new Prisma.Decimal('649.00'),
    bookId: 'b1',
    book: { title: 'Kitap' },
    addressSnapshot: address,
  };
}

function buildService(options: { payments?: PaymentRow[]; verify?: VerifyPaymentResult } = {}) {
  const payments = options.payments ?? [];
  const orders = { o1: order('o1', 'u1'), o2: order('o2', 'u2') };

  const prisma = {
    payment: {
      findUnique: jest.fn(
        async ({ where }: { where: { idempotencyKey: string } }) =>
          payments.find((row) => row.idempotencyKey === where.idempotencyKey) ?? null,
      ),
      findFirst: jest.fn(async ({ where }: { where: { rawResponse: { equals: string } } }) => {
        const row = payments.find((p) => p.rawResponse?.providerToken === where.rawResponse.equals);
        return row == null ? null : { ...row, order: orders[row.orderId as 'o1' | 'o2'] };
      }),
      create: jest.fn(async ({ data }: { data: PaymentRow }) => {
        payments.push(data);
        return data;
      }),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<PaymentRow> }) => {
          const row = payments.find((p) => p.id === where.id);
          if (row) Object.assign(row, data);
          return row;
        },
      ),
    },
    order: { update: jest.fn(async () => undefined) },
  } as unknown as PrismaService;

  const ordersService = {
    findOwned: jest.fn(async (userId: string, orderId: string) => {
      const row = orders[orderId as 'o1' | 'o2'];
      if (row == null) throw AppException.notFound('Order not found');
      if (row.userId !== userId) throw AppException.forbiddenOwnership();
      return row;
    }),
    markPaid: jest.fn(async () => undefined),
  } as unknown as OrdersService;

  const verdict: VerifyPaymentResult = options.verify ?? {
    status: 'SUCCEEDED',
    providerPaymentId: 'tok-1',
    paidAmount: '649.00',
    rawResponse: {},
  };
  const provider: PaymentProvider = {
    name: 'mock',
    createPayment: jest.fn(async () => ({
      providerPaymentId: 'tok-new',
      checkoutUrl: null,
      providerToken: 'tok-new',
    })),
    verifyPayment: jest.fn(async () => verdict),
    refund: jest.fn(async () => ({ refunded: true })),
  };

  const env = { API_PUBLIC_URL: 'http://api.test' } as Env;
  const service = new PaymentsService(prisma, ordersService, provider, env);
  return { service, prisma, provider, ordersService, payments };
}

const pendingPayment = (orderId: string, token: string): PaymentRow => ({
  id: `pay-${orderId}`,
  orderId,
  provider: 'mock',
  providerPaymentId: token,
  amount: new Prisma.Decimal('649.00'),
  status: PaymentStatus.PENDING,
  rawResponse: { checkoutUrl: null, providerToken: token },
  idempotencyKey: `idem-key-${orderId}`,
});

describe('PaymentsService.initPayment idempotency', () => {
  it('replays the same order’s checkout for a reused key', async () => {
    const { service, provider } = buildService({ payments: [pendingPayment('o1', 'tok-1')] });

    const result = await service.initPayment('u1', 'o1', 'idem-key-o1', '1.1.1.1', 'u1@t', 'Ayşe');

    expect(result.paymentId).toBe('pay-o1');
    expect(result.providerToken).toBe('tok-1');
    expect(provider.createPayment).not.toHaveBeenCalled();
  });

  it('refuses a key that belongs to a different order instead of leaking its checkout', async () => {
    // user 2 owns o2 and replays user 1's key (keys are client-chosen).
    const { service, provider } = buildService({ payments: [pendingPayment('o1', 'tok-1')] });

    const attempt = service.initPayment('u2', 'o2', 'idem-key-o1', '1.1.1.1', 'u2@t', 'Veli');

    await expect(attempt).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    await attempt.catch((error: AppException) =>
      expect(error.getStatus()).toBe(HttpStatus.CONFLICT),
    );
    expect(provider.createPayment).not.toHaveBeenCalled();
  });
});

describe('PaymentsService.completeByToken', () => {
  it('accepts a provider amount without decimals and a matching basket id', async () => {
    const { service, ordersService, payments } = buildService({
      payments: [pendingPayment('o1', 'tok-1')],
      verify: {
        status: 'SUCCEEDED',
        providerPaymentId: 'tok-1',
        paidAmount: '649',
        basketId: 'MSL-o1',
        rawResponse: {},
      },
    });

    await expect(service.completeByToken('tok-1')).resolves.toEqual({
      status: PaymentStatus.SUCCEEDED,
      orderId: 'o1',
    });
    expect(ordersService.markPaid).toHaveBeenCalledWith('o1');
    expect(payments[0]!.status).toBe(PaymentStatus.SUCCEEDED);
  });

  it('fails the payment when the basket id names another order', async () => {
    const { service, ordersService, payments } = buildService({
      payments: [pendingPayment('o1', 'tok-1')],
      verify: {
        status: 'SUCCEEDED',
        providerPaymentId: 'tok-1',
        paidAmount: '649.00',
        basketId: 'MSL-o2',
        rawResponse: {},
      },
    });

    await expect(service.completeByToken('tok-1')).rejects.toMatchObject({
      code: ErrorCode.PAYMENT_AMOUNT_MISMATCH,
    });
    expect(ordersService.markPaid).not.toHaveBeenCalled();
    expect(payments[0]!.status).toBe(PaymentStatus.FAILED);
  });

  it('fails the payment on an amount mismatch', async () => {
    const { service, payments } = buildService({
      payments: [pendingPayment('o1', 'tok-1')],
      verify: { status: 'SUCCEEDED', providerPaymentId: 'tok-1', paidAmount: '1', rawResponse: {} },
    });

    await expect(service.completeByToken('tok-1')).rejects.toMatchObject({
      code: ErrorCode.PAYMENT_AMOUNT_MISMATCH,
    });
    expect(payments[0]!.status).toBe(PaymentStatus.FAILED);
  });

  it('mock path: only the order owner may complete by token', async () => {
    const { service, provider } = buildService({ payments: [pendingPayment('o1', 'tok-1')] });

    await expect(service.completeByToken('tok-1', 'u2')).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN_OWNERSHIP,
    });
    expect(provider.verifyPayment).not.toHaveBeenCalled();
    await expect(service.completeByToken('tok-1', 'u1')).resolves.toMatchObject({
      status: PaymentStatus.SUCCEEDED,
    });
  });
});
