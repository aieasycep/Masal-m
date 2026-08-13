import { z } from 'zod';
import { AgeRange } from '@masalim/types';
import { isoDateStringSchema, personNameSchema } from './common';

export const ageRangeSchema = z.nativeEnum(AgeRange);

export const interestSchema = z.string().trim().min(1).max(40);

export const createChildSchema = z
  .object({
    name: personNameSchema,
    birthDate: isoDateStringSchema.optional(),
    ageRange: ageRangeSchema.optional(),
    avatarObjectKey: z.string().max(512).optional(),
    interests: z.array(interestSchema).max(20).default([]),
    preferences: z
      .object({
        nickname: z.string().trim().max(40).optional(),
        notes: z.string().trim().max(500).optional(),
      })
      .default({}),
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
  preferences: z
    .object({
      nickname: z.string().trim().max(40).optional(),
      notes: z.string().trim().max(500).optional(),
    })
    .optional(),
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
  }),
  storyCount: z.number().int(),
  createdAt: z.string(),
});
export type Child = z.infer<typeof childSchema>;

export const recommendationSchema = z.object({
  title: z.string(),
  themes: z.array(z.string()),
  promptSeed: z.string(),
  emoji: z.string(),
});
export type Recommendation = z.infer<typeof recommendationSchema>;
