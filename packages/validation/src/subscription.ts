import { z } from 'zod';
import {
  CREDIT_PACK_PRODUCT_IDS,
  PREMIUM_MONTHLY_PRODUCT_ID,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@masalim/types';

export const subscriptionPlanSchema = z.nativeEnum(SubscriptionPlan);
export const subscriptionStatusSchema = z.nativeEnum(SubscriptionStatus);

export const subscriptionSchema = z.object({
  plan: subscriptionPlanSchema,
  status: subscriptionStatusSchema.nullable(),
  productId: z.string().nullable(),
  expiresAt: z.string().nullable(),
  trialEndsAt: z.string().nullable(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const entitlementsResponseSchema = z.object({
  plan: subscriptionPlanSchema,
  features: z.object({
    parent_voice_clone: z.boolean(),
    premium_system_voices: z.boolean(),
    hd_book_export: z.boolean(),
  }),
  /** Credit state: monthly quota (resets, no rollover) + purchased balance (never expires). */
  credits: z.object({
    quota: z.object({ limit: z.number().int(), used: z.number().int() }),
    balance: z.number().int(),
  }),
});
export type EntitlementsResponse = z.infer<typeof entitlementsResponseSchema>;

/** Store products the paywall can offer this user (prices are server-config). */
export const creditPackOfferSchema = z.object({
  productId: z.string(),
  credits: z.number().int().positive(),
  priceTRY: z.string(),
});
export const offeringsResponseSchema = z.object({
  currency: z.literal('TRY'),
  subscription: z.object({
    productId: z.string(),
    priceTRY: z.string(),
    monthlyCredits: z.number().int().positive(),
  }),
  packs: z.array(creditPackOfferSchema),
});
export type CreditPackOffer = z.infer<typeof creditPackOfferSchema>;
export type OfferingsResponse = z.infer<typeof offeringsResponseSchema>;

/**
 * Normalized subscription event — the single shape the backend consumes.
 * RevenueCat webhooks are mapped into this; the mock IAP flow emits it directly.
 * NON_RENEWING_PURCHASE = consumable credit pack (grants credits, no plan change).
 */
export const subscriptionEventSchema = z.object({
  eventType: z.enum([
    'INITIAL_PURCHASE',
    'RENEWAL',
    'CANCELLATION',
    'EXPIRATION',
    'BILLING_ISSUE',
    'UNCANCELLATION',
    'NON_RENEWING_PURCHASE',
  ]),
  appUserId: z.string(),
  productId: z.string(),
  eventTimeMs: z.number().int(),
  expirationAtMs: z.number().int().nullable(),
  environment: z.enum(['SANDBOX', 'PRODUCTION']),
  /** Store/webhook event id — credit grants are idempotent on it. */
  eventId: z.string().nullish(),
});
export type SubscriptionEvent = z.infer<typeof subscriptionEventSchema>;

export const mockPurchaseSchema = z.object({
  productId: z.enum([
    PREMIUM_MONTHLY_PRODUCT_ID,
    ...(CREDIT_PACK_PRODUCT_IDS as [string, ...string[]]),
  ]),
});
export type MockPurchaseInput = z.infer<typeof mockPurchaseSchema>;
