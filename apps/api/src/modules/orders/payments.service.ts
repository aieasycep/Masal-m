import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ErrorCode, OrderStatus, PaymentStatus } from '@masalim/types';
import type { PaymentProvider } from '@masalim/payments';
import type { InitPaymentResponse } from '@masalim/validation';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PAYMENT } from '../../providers/providers.module';
import { OrdersService } from './orders.service';

/** "649" and "649.00" are the same money; compare on a 2-decimal rendering. */
function normalizeAmount(value: string | null): string | null {
  if (value == null || value.trim() === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : null;
}

/** Strip anything card-like before persisting provider responses (§47). */
function sanitize(raw: unknown): object {
  const clone = JSON.parse(JSON.stringify(raw ?? {})) as Record<string, unknown>;
  for (const key of Object.keys(clone)) {
    if (/card|pan|cvc|cvv|expire/i.test(key)) delete clone[key];
  }
  return clone;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    @Inject(PAYMENT) private readonly paymentProvider: PaymentProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Init checkout (§34): amount comes from the order row, never the client. */
  async initPayment(
    userId: string,
    orderId: string,
    idempotencyKey: string,
    buyerIp: string,
    userEmail: string,
    userName: string,
  ): Promise<InitPaymentResponse> {
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      throw AppException.validation('Idempotency-Key header is required');
    }
    const order = await this.orders.findOwned(userId, orderId);
    if (order.status !== OrderStatus.PENDING) {
      throw new AppException(
        ErrorCode.PAYMENT_FAILED,
        'Order is not awaiting payment',
        HttpStatus.CONFLICT,
      );
    }

    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing != null) {
      // The key is client-chosen: a replay against another order (ownership of
      // THIS order was checked above) must not leak that payment's checkout.
      if (existing.orderId !== order.id) {
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          'Idempotency-Key was used for a different order',
          HttpStatus.CONFLICT,
        );
      }
      const raw = (existing.rawResponse ?? {}) as { checkoutUrl?: string; providerToken?: string };
      return {
        provider: existing.provider,
        checkoutUrl: raw.checkoutUrl ?? null,
        paymentId: existing.id,
        providerToken: existing.provider === 'mock' ? (raw.providerToken ?? null) : null,
      };
    }

    const address = order.addressSnapshot as {
      fullName: string;
      phone: string;
      addressLine: string;
      city: string;
      district: string;
      postalCode: string;
    };
    const paymentId = randomUUID();
    const result = await this.paymentProvider.createPayment({
      paymentId,
      orderNumber: order.orderNumber,
      amount: order.total.toFixed(2),
      currency: 'TRY',
      buyer: {
        id: userId,
        name: userName,
        email: userEmail,
        phone: address.phone,
        ip: buyerIp || '85.34.78.112',
      },
      shippingAddress: address,
      basketItems: [{ id: order.bookId, name: order.book.title, price: order.total.toFixed(2) }],
      callbackUrl: `${this.env.API_PUBLIC_URL}/payments/iyzico/callback`,
    });

    const row = await this.prisma.payment.create({
      data: {
        id: paymentId,
        orderId: order.id,
        provider: this.paymentProvider.name,
        providerPaymentId: result.providerPaymentId,
        amount: order.total,
        currency: 'TRY',
        status: PaymentStatus.PENDING,
        idempotencyKey,
        rawResponse: {
          checkoutUrl: result.checkoutUrl,
          providerToken: result.providerToken,
        },
      },
    });

    return {
      provider: row.provider,
      checkoutUrl: result.checkoutUrl,
      paymentId: row.id,
      // The dev flow completes mock payments directly; real providers go
      // through their hosted checkout + callback and never expose the token.
      providerToken: this.paymentProvider.name === 'mock' ? result.providerToken : null,
    };
  }

  /**
   * Verify a completed checkout (§82): the provider-reported paid amount MUST
   * match the expected order total (and the echoed basket id the order
   * number); a mismatch fails the payment. `ownerUserId` is set by the
   * authenticated mock path; the iyzico callback is unowned because its
   * token is provider-issued.
   */
  async completeByToken(
    providerToken: string,
    ownerUserId?: string,
  ): Promise<{ status: PaymentStatus; orderId: string }> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        rawResponse: { path: ['providerToken'], equals: providerToken },
      },
      include: { order: true },
    });
    if (payment == null) throw AppException.notFound('Payment not found');
    if (ownerUserId != null && payment.order.userId !== ownerUserId) {
      throw AppException.forbiddenOwnership();
    }
    if (payment.status === PaymentStatus.SUCCEEDED) {
      return { status: payment.status, orderId: payment.orderId };
    }

    const verdict = await this.paymentProvider.verifyPayment(providerToken);
    if (verdict.status === 'SUCCEEDED') {
      const expected = normalizeAmount(payment.order.total.toFixed(2));
      const paid = normalizeAmount(verdict.paidAmount);
      const basketMismatch =
        verdict.basketId != null && verdict.basketId !== payment.order.orderNumber;
      if (paid == null || paid !== expected || basketMismatch) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.FAILED,
            rawResponse: {
              ...sanitize(verdict.rawResponse),
              mismatch: {
                expected,
                paid: verdict.paidAmount,
                orderNumber: payment.order.orderNumber,
                basketId: verdict.basketId ?? null,
              },
            },
          },
        });
        this.logger.error(
          {
            paymentId: payment.id,
            expected,
            paid: verdict.paidAmount,
            orderNumber: payment.order.orderNumber,
            basketId: verdict.basketId ?? null,
          },
          'payment amount mismatch',
        );
        throw new AppException(
          ErrorCode.PAYMENT_AMOUNT_MISMATCH,
          'Paid amount does not match the order total',
          HttpStatus.CONFLICT,
        );
      }
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCEEDED,
          // Refunds must name the provider's transaction id, which only the
          // verify response carries — keep it with the payment.
          providerTransactionId: verdict.providerTransactionId,
          rawResponse: sanitize(verdict.rawResponse),
        },
      });
      await this.orders.markPaid(payment.orderId);
      return { status: PaymentStatus.SUCCEEDED, orderId: payment.orderId };
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED, rawResponse: sanitize(verdict.rawResponse) },
    });
    await this.prisma.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: PaymentStatus.FAILED },
    });
    return { status: PaymentStatus.FAILED, orderId: payment.orderId };
  }

  /** Refund on cancellation of a PAID order. */
  async refundOrder(orderId: string): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, status: PaymentStatus.SUCCEEDED },
    });
    if (payment?.providerPaymentId == null) return;
    const { refunded } = await this.paymentProvider.refund({
      providerPaymentId: payment.providerPaymentId,
      amount: payment.amount.toFixed(2),
      providerTransactionId: payment.providerTransactionId,
    });
    if (refunded) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.REFUNDED },
      });
      await this.prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: PaymentStatus.REFUNDED },
      });
    }
  }
}
