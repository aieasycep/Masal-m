import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DEFAULT_MONETIZATION, SubscriptionPlan } from '@masalim/types';
import type { OfferingsResponse } from '@masalim/validation';
import { PrismaService } from '../../prisma/prisma.service';

const configSchema = z.object({
  currency: z.literal('TRY').default('TRY'),
  subscription: z.object({
    productId: z.string(),
    priceTRY: z.string(),
    monthlyCredits: z.number().int().positive(),
  }),
  packs: z.array(
    z.object({
      productId: z.string(),
      tier: z.nativeEnum(SubscriptionPlan),
      credits: z.number().int().positive(),
      priceTRY: z.string(),
    }),
  ),
});
export type MonetizationConfig = z.infer<typeof configSchema>;

const CONFIG_KEY = 'monetization_v1';
const CACHE_TTL_MS = 60_000;

/**
 * Runtime price source (launch decision Sep 2026): prices/quotas live in the
 * PricingConfig row `monetization_v1`, seeded from DEFAULT_MONETIZATION and
 * editable in the database — sticker prices can change without an app update.
 * Store products stay fixed-price, hence the per-tier _std/_member pack pairs.
 */
@Injectable()
export class MonetizationConfigService {
  private cached: { value: MonetizationConfig; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<MonetizationConfig> {
    if (this.cached != null && Date.now() - this.cached.at < CACHE_TTL_MS) {
      return this.cached.value;
    }
    const row = await this.prisma.pricingConfig.findFirst({
      where: { key: CONFIG_KEY, active: true },
    });
    const parsed = row == null ? null : configSchema.safeParse(row.value);
    const value = parsed?.success ? parsed.data : configSchema.parse(DEFAULT_MONETIZATION);
    this.cached = { value, at: Date.now() };
    return value;
  }

  /** Paywall offerings for a user: subscription + the pack set matching their plan. */
  async offeringsFor(plan: SubscriptionPlan): Promise<OfferingsResponse> {
    const config = await this.get();
    return {
      currency: 'TRY',
      subscription: config.subscription,
      packs: config.packs
        .filter((pack) => pack.tier === plan)
        .map(({ productId, credits, priceTRY }) => ({ productId, credits, priceTRY })),
    };
  }

  async packFor(productId: string): Promise<MonetizationConfig['packs'][number] | null> {
    const config = await this.get();
    return config.packs.find((pack) => pack.productId === productId) ?? null;
  }
}
