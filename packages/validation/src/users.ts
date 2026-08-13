import { z } from 'zod';
import { localeSchema, personNameSchema } from './common';

export const updateMeSchema = z
  .object({
    name: personNameSchema,
    locale: localeSchema,
    timezone: z.string().max(64),
    onboardingCompleted: z.boolean(),
    avatarObjectKey: z.string().max(512).nullable(),
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
