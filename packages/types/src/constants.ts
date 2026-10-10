import type { AgeRange, OrderStatus, StoryDuration } from './enums';

/** Domain constants — kept central so no magic numbers/strings spread through the codebase. */

export const VOICE_RECORDING = {
  // UI/UX QA pass raised the quality floor from 30s to 45s.
  MIN_DURATION_SECONDS: 45,
  MAX_DURATION_SECONDS: 90,
  TARGET_DURATION_SECONDS: 60,
  MAX_UPLOAD_BYTES: 25 * 1024 * 1024,
  ACCEPTED_MIME_TYPES: [
    'audio/m4a',
    'audio/x-m4a',
    'audio/mp4',
    'audio/aac',
    'audio/wav',
    'audio/mpeg',
  ],
} as const;

export const AVATAR_UPLOAD = {
  MAX_UPLOAD_BYTES: 5 * 1024 * 1024,
  ACCEPTED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
} as const;

/** Approximate spoken duration per target; drives page/word budgets in the prompt engine. */
export const DURATION_TARGETS: Record<
  StoryDuration,
  { minutes: number; pages: number; wordsPerPage: number }
> = {
  SHORT: { minutes: 3, pages: 6, wordsPerPage: 70 },
  MEDIUM: { minutes: 6, pages: 10, wordsPerPage: 85 },
  LONG: { minutes: 10, pages: 14, wordsPerPage: 100 },
};

export const AGE_RANGE_LABELS: Record<AgeRange, string> = {
  AGE_0_2: '0–2',
  AGE_3_5: '3–5',
  AGE_6_8: '6–8',
  AGE_9_12: '9–12',
};

export const JWT = {
  ACCESS_TTL_SECONDS: 15 * 60,
  REFRESH_TTL_SECONDS: 30 * 24 * 60 * 60,
} as const;

export const ACCOUNT_DELETION_GRACE_DAYS = 7;

export const SIGNED_URL_DEFAULT_TTL_SECONDS = 15 * 60;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
} as const;

/** Deep link scheme + web fallback host. */
export const DEEP_LINK = {
  SCHEME: 'masalim',
  WEB_HOST: 'masalim.app',
} as const;

/**
 * Legal order status transitions (admin panel + processors). CANCELLED and
 * REFUNDED are terminal; a refund is possible from any paid state.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['IN_PRODUCTION', 'CANCELLED', 'REFUNDED'],
  IN_PRODUCTION: ['SHIPPED', 'REFUNDED'],
  SHIPPED: ['DELIVERED', 'REFUNDED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

/** E-mail verification codes (only enforced while the server mails for real). */
export const EMAIL_VERIFICATION = {
  CODE_TTL_SECONDS: 15 * 60,
  RESEND_COOLDOWN_SECONDS: 60,
  MAX_ATTEMPTS: 5,
} as const;

/** Oldest push tokens beyond this count are dropped on registration. */
export const PUSH_DEVICES_PER_USER_MAX = 10;

/** Cached narration chunks older than this are swept even if a retry never came. */
export const NARRATION_CACHE_RETENTION_DAYS = 7;

/** Client uploads that nothing references after this long are deleted. */
export const ORPHAN_UPLOAD_GRACE_HOURS = 24;
