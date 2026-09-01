import type { StoryDuration, SubscriptionPlan } from './enums';

/**
 * Feature entitlement keys. Resolved by the backend EntitlementService;
 * both the API guards and the mobile UI read the same resolved set.
 */
export const EntitlementKey = {
  /** Monthly credit allowance (1 kredi ≈ 1 masal dakikası) — resets each month, does not roll over. */
  CREDIT_MONTHLY_QUOTA: 'credit_monthly_quota',
  PARENT_VOICE_CLONE: 'parent_voice_clone',
  PREMIUM_SYSTEM_VOICES: 'premium_system_voices',
  HD_BOOK_EXPORT: 'hd_book_export',
} as const;
export type EntitlementKey = (typeof EntitlementKey)[keyof typeof EntitlementKey];

/**
 * Credit cost of generating a story, by duration target (1 kredi ≈ 1 dakika).
 * The story's FIRST narration and FIRST illustration set are included in this
 * price; listening/replays are always free.
 */
export const STORY_CREDIT_COSTS: Record<StoryDuration, number> = {
  SHORT: 3,
  MEDIUM: 6,
  LONG: 10,
};

/**
 * Credit cost of EXTRA productions on an existing story version — a second
 * (different-voice) narration or a second illustration set: half the story
 * cost, rounded up.
 */
export const EXTRA_ACTION_CREDIT_COSTS: Record<StoryDuration, number> = {
  SHORT: 2,
  MEDIUM: 3,
  LONG: 5,
};

/** One-time welcome gift, granted to every new account (2 kısa masal). */
export const SIGNUP_GIFT_CREDITS = 6;

/** Ledger reasons — mirrored in prisma schema (enum CreditReason, drift-guarded). */
export const CreditReason = {
  SIGNUP_GIFT: 'SIGNUP_GIFT',
  PURCHASE: 'PURCHASE',
  STORY_SPEND: 'STORY_SPEND',
  EXTRA_NARRATION_SPEND: 'EXTRA_NARRATION_SPEND',
  EXTRA_ILLUSTRATION_SPEND: 'EXTRA_ILLUSTRATION_SPEND',
  REFUND: 'REFUND',
  ADMIN_ADJUST: 'ADMIN_ADJUST',
} as const;
export type CreditReason = (typeof CreditReason)[keyof typeof CreditReason];

export interface ResolvedEntitlements {
  plan: SubscriptionPlan;
  /** Feature flags resolved for this user (boolean features). */
  features: {
    [EntitlementKey.PARENT_VOICE_CLONE]: boolean;
    [EntitlementKey.PREMIUM_SYSTEM_VOICES]: boolean;
    [EntitlementKey.HD_BOOK_EXPORT]: boolean;
  };
  /** Credit state: monthly quota (resets) + purchased balance (never expires). */
  credits: {
    quota: { limit: number; used: number };
    balance: number;
  };
}

/** Plan → entitlement matrix (backend source of truth; documented for clients). */
export const PLAN_ENTITLEMENTS: Record<
  SubscriptionPlan,
  {
    monthlyCreditQuota: number;
    parentVoiceClone: boolean;
    premiumSystemVoices: boolean;
    hdBookExport: boolean;
  }
> = {
  FREE: {
    // "Ayda 1 kısa masal" — a small recurring taste that brings users back.
    monthlyCreditQuota: 3,
    parentVoiceClone: false,
    premiumSystemVoices: false,
    hdBookExport: false,
  },
  PREMIUM: {
    monthlyCreditQuota: 30,
    parentVoiceClone: true,
    premiumSystemVoices: true,
    hdBookExport: true,
  },
};

/**
 * Store products. Credit-pack prices differ by plan tier, and store products
 * carry fixed prices — so each pack size exists twice (std = free users,
 * member = premium subscribers). The offerings endpoint returns only the set
 * matching the caller's plan; DEFAULT_MONETIZATION seeds the server-side
 * price config (PricingConfig key `monetization_v1`) which the API treats as
 * the runtime source of truth, so prices can change without an app update.
 */
export const PREMIUM_MONTHLY_PRODUCT_ID = 'masalim_premium_monthly';

export interface CreditPackProduct {
  productId: string;
  tier: SubscriptionPlan;
  credits: number;
  priceTRY: string;
}

export const DEFAULT_MONETIZATION = {
  subscription: {
    productId: PREMIUM_MONTHLY_PRODUCT_ID,
    priceTRY: '999.99',
    monthlyCredits: PLAN_ENTITLEMENTS.PREMIUM.monthlyCreditQuota,
  },
  packs: [
    { productId: 'masalim_credits_6_std', tier: 'FREE', credits: 6, priceTRY: '299.99' },
    { productId: 'masalim_credits_12_std', tier: 'FREE', credits: 12, priceTRY: '599.99' },
    { productId: 'masalim_credits_30_std', tier: 'FREE', credits: 30, priceTRY: '1499.99' },
    { productId: 'masalim_credits_6_member', tier: 'PREMIUM', credits: 6, priceTRY: '239.99' },
    { productId: 'masalim_credits_12_member', tier: 'PREMIUM', credits: 12, priceTRY: '479.99' },
    { productId: 'masalim_credits_30_member', tier: 'PREMIUM', credits: 30, priceTRY: '1199.99' },
  ] satisfies CreditPackProduct[],
} as const;

export const CREDIT_PACK_PRODUCT_IDS = DEFAULT_MONETIZATION.packs.map((pack) => pack.productId);
