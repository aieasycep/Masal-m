import { AgeRange, StoryDuration } from './enums';

/** Domain constants — kept central so no magic numbers/strings spread through the codebase. */

export const VOICE_RECORDING = {
  MIN_DURATION_SECONDS: 30,
  MAX_DURATION_SECONDS: 90,
  TARGET_DURATION_SECONDS: 60,
  MAX_UPLOAD_BYTES: 25 * 1024 * 1024,
  ACCEPTED_MIME_TYPES: ['audio/m4a', 'audio/x-m4a', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/mpeg'],
} as const;

export const AVATAR_UPLOAD = {
  MAX_UPLOAD_BYTES: 5 * 1024 * 1024,
  ACCEPTED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
} as const;

/** Approximate spoken duration per target; drives page/word budgets in the prompt engine. */
export const DURATION_TARGETS: Record<StoryDuration, { minutes: number; pages: number; wordsPerPage: number }> = {
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
