import { z } from 'zod';
import { IllustrationSetStatus, IllustrationStyle } from '@masalim/types';

export const illustrationStyleSchema = z.nativeEnum(IllustrationStyle);
export const illustrationSetStatusSchema = z.nativeEnum(IllustrationSetStatus);

export const createIllustrationSetSchema = z.object({
  style: illustrationStyleSchema,
});
export type CreateIllustrationSetInput = z.infer<typeof createIllustrationSetSchema>;

export const illustrationSchema = z.object({
  id: z.string(),
  storyPageId: z.string().nullable(),
  isCover: z.boolean(),
  imageUrl: z.string(),
  selected: z.boolean(),
  createdAt: z.string(),
});
export type Illustration = z.infer<typeof illustrationSchema>;

export const illustrationSetSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  storyVersion: z.number().int(),
  style: illustrationStyleSchema,
  status: illustrationSetStatusSchema,
  /** Real progress: pages completed out of total (cover counts as one unit). */
  progress: z.object({ completed: z.number().int(), total: z.number().int() }),
  illustrations: z.array(illustrationSchema),
  createdAt: z.string(),
  jobId: z.string().nullable(),
});
export type IllustrationSet = z.infer<typeof illustrationSetSchema>;

export const selectIllustrationSchema = z.object({
  selected: z.literal(true),
});
export type SelectIllustrationInput = z.infer<typeof selectIllustrationSchema>;
