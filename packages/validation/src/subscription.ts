import { z } from 'zod';
import { SubscriptionPlan, SubscriptionStatus } from '@masalim/types';

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
  quotas: z.object({
    story_monthly_limit: z.object({ limit: z.number().int(), used: z.number().int() }),
    illustration_limit: z.object({ limit: z.number().int(), used: z.number().int() }),
  }),
});
export type EntitlementsResponse = z.infer<typeof entitlementsResponseSchema>;

/**
 * Normalized subscription event — the single shape the backend consumes.
 * RevenueCat webhooks are mapped into this; the mock IAP flow emits it directly.
 */
export const subscriptionEventSchema = z.object({
  eventType: z.enum(['INITIAL_PURCHASE', 'RENEWAL', 'CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE', 'UNCANCELLATION']),
  appUserId: z.string(),
  productId: z.string(),
  eventTimeMs: z.number().int(),
  expirationAtMs: z.number().int().nullable(),
  environment: z.enum(['SANDBOX', 'PRODUCTION']),
});
export type SubscriptionEvent = z.infer<typeof subscriptionEventSchema>;

export const mockPurchaseSchema = z.object({
  productId: z.enum(['masalim_premium_monthly', 'masalim_premium_yearly']),
});
export type MockPurchaseInput = z.infer<typeof mockPurchaseSchema>;
