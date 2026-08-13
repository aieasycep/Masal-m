import type { SubscriptionPlan } from './enums';

/**
 * Feature entitlement keys. Resolved by the backend EntitlementService;
 * both the API guards and the mobile UI read the same resolved set.
 */
export const EntitlementKey = {
  STORY_MONTHLY_LIMIT: 'story_monthly_limit',
  PARENT_VOICE_CLONE: 'parent_voice_clone',
  PREMIUM_SYSTEM_VOICES: 'premium_system_voices',
  ILLUSTRATION_MONTHLY_LIMIT: 'illustration_limit',
  HD_BOOK_EXPORT: 'hd_book_export',
} as const;
export type EntitlementKey = (typeof EntitlementKey)[keyof typeof EntitlementKey];

export interface ResolvedEntitlements {
  plan: SubscriptionPlan;
  /** Feature flags resolved for this user (boolean features). */
  features: {
    [EntitlementKey.PARENT_VOICE_CLONE]: boolean;
    [EntitlementKey.PREMIUM_SYSTEM_VOICES]: boolean;
    [EntitlementKey.HD_BOOK_EXPORT]: boolean;
  };
  /** Quota features: limit + current usage in the active period. */
  quotas: {
    [EntitlementKey.STORY_MONTHLY_LIMIT]: { limit: number; used: number };
    [EntitlementKey.ILLUSTRATION_MONTHLY_LIMIT]: { limit: number; used: number };
  };
}

/** Plan → entitlement matrix (backend source of truth; documented for clients). */
export const PLAN_ENTITLEMENTS: Record<
  SubscriptionPlan,
  { storyMonthlyLimit: number; illustrationMonthlyLimit: number; parentVoiceClone: boolean; premiumSystemVoices: boolean; hdBookExport: boolean }
> = {
  FREE: {
    storyMonthlyLimit: 5,
    illustrationMonthlyLimit: 2,
    parentVoiceClone: false,
    premiumSystemVoices: false,
    hdBookExport: false,
  },
  PREMIUM: {
    storyMonthlyLimit: 60,
    illustrationMonthlyLimit: 30,
    parentVoiceClone: true,
    premiumSystemVoices: true,
    hdBookExport: true,
  },
};
