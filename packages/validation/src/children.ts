import { z } from 'zod';
import { AgeRange } from '@masalim/types';
import { isoDateStringSchema, personNameSchema } from './common';

export const ageRangeSchema = z.nativeEnum(AgeRange);

export const interestSchema = z.string().trim().min(1).max(40);

/**
 * Free-form child preferences stored as JSON. `avatarEmoji` + `ageYears` back
 * the design's avatar picker and exact-age stepper (Child/01) — `ageRange`
 * stays the API-facing bucket derived from `ageYears`.
 */
const childPreferencesSchema = z.object({
  nickname: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(500).optional(),
  avatarEmoji: z.string().trim().min(1).max(8).optional(),
  ageYears: z.number().int().min(0).max(12).optional(),
});

export const createChildSchema = z
  .object({
    name: personNameSchema,
    birthDate: isoDateStringSchema.optional(),
    ageRange: ageRangeSchema.optional(),
    avatarObjectKey: z.string().max(512).optional(),
    interests: z.array(interestSchema).max(20).default([]),
    preferences: childPreferencesSchema.default({}),
  })
  .refine((v) => v.birthDate != null || v.ageRange != null, {
    message: 'birthDate_or_ageRange_required',
    path: ['ageRange'],
  });
export type CreateChildInput = z.infer<typeof createChildSchema>;

export const updateChildSchema = z.object({
  name: personNameSchema.optional(),
  birthDate: isoDateStringSchema.nullable().optional(),
  ageRange: ageRangeSchema.optional(),
  avatarObjectKey: z.string().max(512).nullable().optional(),
  interests: z.array(interestSchema).max(20).optional(),
  preferences: childPreferencesSchema.optional(),
});
export type UpdateChildInput = z.infer<typeof updateChildSchema>;

export const childSchema = z.object({
  id: z.string(),
  name: z.string(),
  birthDate: z.string().nullable(),
  ageRange: ageRangeSchema,
  avatarUrl: z.string().nullable(),
  interests: z.array(z.string()),
  preferences: z.object({
    nickname: z.string().optional(),
    notes: z.string().optional(),
    avatarEmoji: z.string().optional(),
    ageYears: z.number().optional(),
  }),
  storyCount: z.number().int(),
  createdAt: z.string(),
});
export type Child = z.infer<typeof childSchema>;

/** `?limit=` for GET /children/:id/recommendations — Home shows 3, the full list up to 12. */
export const recommendationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(3),
});
export type RecommendationsQuery = z.infer<typeof recommendationsQuerySchema>;

export const recommendationSchema = z.object({
  title: z.string(),
  themes: z.array(z.string()),
  promptSeed: z.string(),
  emoji: z.string(),
});
export type Recommendation = z.infer<typeof recommendationSchema>;
