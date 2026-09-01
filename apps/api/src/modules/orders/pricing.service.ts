import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type BookSize, type CoverType } from '@masalim/types';
import type { OrderQuote } from '@masalim/validation';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';

interface PricingTable {
  currency: 'TRY';
  basePrices: Record<BookSize, Record<CoverType, string>>;
  shippingFlat: string;
  freeShippingThreshold: string;
  quantityDiscounts: Array<{ minQuantity: number; percentOff: number }>;
  estimatedDeliveryDays: { min: number; max: number };
}

/** Parse "649.00" into integer kuruş — all money math is integer math. */
function toKurus(value: string): number {
  const match = value.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (match == null) throw new Error(`invalid money value: ${value}`);
  return Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
}

function toDecimalString(kurus: number): string {
  return `${Math.floor(kurus / 100)}.${String(kurus % 100).padStart(2, '0')}`;
}

/**
 * Server-side pricing (§82): the client only ever sends the configuration;
 * every price comes from the versioned PricingConfig row.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(input: {
    quantity: number;
    bookSize: BookSize;
    coverType: CoverType;
  }): Promise<OrderQuote> {
    const table = await this.loadTable();
    const unit = toKurus(table.basePrices[input.bookSize][input.coverType]);
    let subtotal = unit * input.quantity;

    const discount = [...table.quantityDiscounts]
      .sort((a, b) => b.minQuantity - a.minQuantity)
      .find((tier) => input.quantity >= tier.minQuantity);
    if (discount != null) {
      subtotal = Math.round(subtotal * (1 - discount.percentOff / 100));
    }

    const shipping =
      subtotal >= toKurus(table.freeShippingThreshold) ? 0 : toKurus(table.shippingFlat);

    return {
      subtotal: toDecimalString(subtotal),
      shipping: toDecimalString(shipping),
      total: toDecimalString(subtotal + shipping),
      currency: 'TRY',
      estimatedDeliveryDays: table.estimatedDeliveryDays,
    };
  }

  private async loadTable(): Promise<PricingTable> {
    // PricingConfig now also carries the monetization row (monetization_v1) —
    // pin the lookup to book-pricing keys or the newest active row could be a
    // config with no basePrices at all.
    const row = await this.prisma.pricingConfig.findFirst({
      where: { active: true, key: { startsWith: 'book_pricing' } },
      orderBy: { createdAt: 'desc' },
    });
    if (row == null) {
      throw new AppException(
        ErrorCode.FEATURE_DISABLED,
        'Pricing is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return row.value as unknown as PricingTable;
  }
}
