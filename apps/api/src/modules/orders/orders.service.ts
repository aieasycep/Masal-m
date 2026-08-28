import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  AIJobType,
  ErrorCode,
  OrderStatus,
  PaymentStatus,
} from '@masalim/types';
import type { StorageProvider } from '@masalim/storage';
import type {
  CreateOrderInput,
  Order as OrderDto,
  OrderConfiguration,
  OrderQuote,
} from '@masalim/validation';
import type { Prisma } from '@masalim/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { STORAGE } from '../../providers/providers.module';
import { JobsService } from '../../jobs/jobs.service';
import { BooksService } from '../books/books.service';
import { AddressesService } from '../addresses/addresses.service';
import { PricingService } from './pricing.service';

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { book: { select: { title: true; coverImageKey: true } }; shippingAddress: true };
}>;

const ORDER_INCLUDE = {
  book: { select: { title: true, coverImageKey: true } },
  shippingAddress: true,
} satisfies Prisma.OrderInclude;

function orderNumber(): string {
  const now = new Date();
  const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  return `MSL-${date}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly books: BooksService,
    private readonly addresses: AddressesService,
    private readonly pricing: PricingService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  /** Review-screen price — always recomputed server-side (§82). */
  async quote(userId: string, input: OrderConfiguration): Promise<OrderQuote> {
    await this.books.findOwned(userId, input.bookId);
    return this.pricing.quote(input);
  }

  /**
   * Create order (§78/§81): pricing + address snapshot in one transaction,
   * idempotency-key dedupe, then the snapshot job copies all print assets to
   * the immutable orders/{id}/ prefix.
   */
  async create(userId: string, input: CreateOrderInput, idempotencyKey: string): Promise<OrderDto> {
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      throw AppException.validation('Idempotency-Key header is required');
    }
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey },
      include: ORDER_INCLUDE,
    });
    if (existing != null) {
      if (existing.userId !== userId) throw AppException.forbiddenOwnership();
      return this.toDto(existing);
    }

    const book = await this.books.findOwned(userId, input.bookId);
    if (book.printPdfKey == null) {
      throw new AppException(
        ErrorCode.ORDER_CREATION_FAILED,
        'Book print file must be rendered before ordering',
        HttpStatus.CONFLICT,
      );
    }
    const address = await this.addresses.findOwned(userId, input.shippingAddressId);
    const quote = await this.pricing.quote(input);

    const row = await this.prisma.order.create({
      data: {
        userId,
        bookId: book.id,
        orderNumber: orderNumber(),
        quantity: input.quantity,
        bookSize: input.bookSize,
        coverType: input.coverType,
        subtotal: quote.subtotal,
        shipping: quote.shipping,
        total: quote.total,
        currency: 'TRY',
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        shippingAddressId: address.id,
        addressSnapshot: {
          fullName: address.fullName,
          phone: address.phone,
          addressLine: address.addressLine,
          city: address.city,
          district: address.district,
          postalCode: address.postalCode,
        },
        bookSnapshot: {
          bookId: book.id,
          storyVersion: book.storyVersion,
          title: book.title,
          pageCount: book.pages.length,
        },
        estimatedDeliveryMin: quote.estimatedDeliveryDays.min,
        estimatedDeliveryMax: quote.estimatedDeliveryDays.max,
        idempotencyKey,
        statusTimeline: [{ status: OrderStatus.PENDING, at: new Date().toISOString() }],
      },
      include: ORDER_INCLUDE,
    });
    return this.toDto(row);
  }

  async list(userId: string): Promise<OrderDto[]> {
    const rows = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: ORDER_INCLUDE,
    });
    return Promise.all(rows.map((row) => this.toDto(row)));
  }

  async get(userId: string, orderId: string): Promise<OrderDto> {
    const row = await this.findOwned(userId, orderId);
    return this.toDto(row);
  }

  /** Cancellable until production starts (§35); refunds land via PaymentsService. */
  async cancel(userId: string, orderId: string): Promise<OrderDto> {
    const order = await this.findOwned(userId, orderId);
    if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PAID) {
      throw new AppException(
        ErrorCode.ORDER_NOT_CANCELLABLE,
        'Order is already in production or shipped',
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.transition(order.id, OrderStatus.CANCELLED);
    return this.toDto(updated);
  }

  /** Payment success hook: mark paid + enqueue the immutable snapshot job (§81). */
  async markPaid(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (order == null || order.status !== OrderStatus.PENDING) return;
    await this.transition(orderId, OrderStatus.PAID, { paymentStatus: PaymentStatus.SUCCEEDED });
    await this.jobs.enqueue({
      userId: order.userId,
      type: AIJobType.ORDER_SNAPSHOT,
      entityId: orderId,
      queueJobId: `order:${orderId}:snapshot`,
    });
  }

  async transition(
    orderId: string,
    status: OrderStatus,
    extra: Prisma.OrderUpdateInput = {},
  ): Promise<OrderWithRelations> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (order == null) throw AppException.notFound('Order not found');
    const timeline = [
      ...((order.statusTimeline as Array<{ status: string; at: string }>) ?? []),
      { status, at: new Date().toISOString() },
    ];
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status, statusTimeline: timeline, ...extra },
      include: ORDER_INCLUDE,
    });
  }

  async findOwned(userId: string, orderId: string): Promise<OrderWithRelations> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (row == null) throw AppException.notFound('Order not found');
    if (row.userId !== userId) throw AppException.forbiddenOwnership();
    return row;
  }

  private async toDto(row: OrderWithRelations): Promise<OrderDto> {
    const snapshotAddress = row.addressSnapshot as {
      fullName: string;
      phone: string;
      addressLine: string;
      city: string;
      district: string;
      postalCode: string;
    } | null;
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      bookId: row.bookId,
      bookTitle: row.book.title,
      coverImageUrl: row.book.coverImageKey
        ? await this.storage.getSignedUrl(row.book.coverImageKey)
        : null,
      quantity: row.quantity,
      bookSize: row.bookSize,
      coverType: row.coverType,
      subtotal: row.subtotal.toFixed(2),
      shipping: row.shipping.toFixed(2),
      total: row.total.toFixed(2),
      currency: 'TRY',
      status: row.status,
      paymentStatus: row.paymentStatus,
      shippingAddress: snapshotAddress ? { id: row.shippingAddressId ?? '', isDefault: false, ...snapshotAddress } : null,
      trackingNumber: row.trackingNumber,
      carrier: row.carrier,
      trackingUrl: row.trackingUrl,
      estimatedDeliveryDays:
        row.estimatedDeliveryMin != null && row.estimatedDeliveryMax != null
          ? { min: row.estimatedDeliveryMin, max: row.estimatedDeliveryMax }
          : null,
      createdAt: row.createdAt.toISOString(),
      timeline: ((row.statusTimeline as Array<{ status: OrderStatus; at: string }>) ?? []).map(
        (entry) => ({ status: entry.status, at: entry.at }),
      ),
    };
  }
}
