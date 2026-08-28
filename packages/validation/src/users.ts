import { z } from 'zod';
import { localeSchema, personNameSchema } from './common';

/**
 * Per-category push opt-outs keyed by NotificationType. Missing keys mean the
 * category is enabled — the client only stores explicit choices.
 */
export const notificationPrefsSchema = z.record(
  z.enum([
    'STORY_READY',
    'VOICE_READY',
    'ILLUSTRATIONS_READY',
    'BOOK_READY',
    'ORDER_SHIPPED',
    'GENERIC',
  ]),
  z.boolean(),
);
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const updateMeSchema = z
  .object({
    name: personNameSchema,
    locale: localeSchema,
    timezone: z.string().max(64),
    onboardingCompleted: z.boolean(),
    avatarObjectKey: z.string().max(512).nullable(),
    notificationPrefs: notificationPrefsSchema,
  })
  .partial();
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  locale: localeSchema,
  timezone: z.string().nullable(),
  onboardingCompleted: z.boolean(),
  subscriptionPlan: z.enum(['FREE', 'PREMIUM']),
  notificationPrefs: notificationPrefsSchema,
  pendingDeletion: z
    .object({ requestedAt: z.string(), effectiveAt: z.string() })
    .nullable(),
  createdAt: z.string(),
});
export type Me = z.infer<typeof meSchema>;

export const deleteAccountSchema = z.object({
  /** Email-auth users confirm with password; social-auth users pass confirm: true. */
  password: z.string().max(128).optional(),
  confirm: z.literal(true),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
