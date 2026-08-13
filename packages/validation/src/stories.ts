import { z } from 'zod';
import {
  HeroType,
  ModerationStatus,
  StoryDuration,
  StoryStatus,
  StoryTheme,
} from '@masalim/types';
import { ageRangeSchema } from './children';
import { paginationQuerySchema, personNameSchema } from './common';

export const storyThemeSchema = z.nativeEnum(StoryTheme);
export const storyDurationSchema = z.nativeEnum(StoryDuration);
export const heroTypeSchema = z.nativeEnum(HeroType);
export const storyStatusSchema = z.nativeEnum(StoryStatus);
export const moderationStatusSchema = z.nativeEnum(ModerationStatus);

/** Wizard payload → POST /stories (creates a DRAFT; generation is a second call). */
export const createStorySchema = z.object({
  childId: z.string().cuid().nullable().default(null),
  heroName: personNameSchema,
  heroType: heroTypeSchema.default(HeroType.CHILD),
  themes: z.array(storyThemeSchema).min(1).max(4),
  ageRange: ageRangeSchema,
  durationTarget: storyDurationSchema,
  customPrompt: z.string().trim().max(500).optional(),
  educationalGoal: z.string().trim().max(200).optional(),
  advanced: z
    .object({
      teachNewWords: z.boolean().optional(),
      calmEnding: z.boolean().optional(),
      humorLevel: z.enum(['none', 'light', 'playful']).optional(),
      fantasyLevel: z.enum(['grounded', 'balanced', 'high']).optional(),
    })
    .default({}),
  language: z.enum(['tr', 'en']).default('tr'),
});
export type CreateStoryInput = z.infer<typeof createStorySchema>;

export const updateStorySchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  /** Full replacement of page texts; bumps story version (copy-on-write revision). */
  pages: z
    .array(
      z.object({
        pageNumber: z.number().int().min(1),
        text: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .optional(),
});
export type UpdateStoryInput = z.infer<typeof updateStorySchema>;

export const listStoriesQuerySchema = paginationQuerySchema.extend({
  filter: z.enum(['all', 'audio', 'books', 'favorites']).default('all'),
  search: z.string().trim().max(100).optional(),
  childId: z.string().cuid().optional(),
  sort: z.enum(['newest', 'oldest', 'title']).default('newest'),
});
export type ListStoriesQuery = z.infer<typeof listStoriesQuerySchema>;

export const storyPageSchema = z.object({
  id: z.string(),
  pageNumber: z.number().int(),
  text: z.string(),
  illustrationUrl: z.string().nullable(),
});
export type StoryPage = z.infer<typeof storyPageSchema>;

export const storySummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: storyStatusSchema,
  childId: z.string().nullable(),
  childName: z.string().nullable(),
  heroName: z.string(),
  themes: z.array(storyThemeSchema),
  durationTarget: storyDurationSchema,
  coverImageUrl: z.string().nullable(),
  isFavorite: z.boolean(),
  hasBook: z.boolean(),
  latestNarration: z
    .object({
      id: z.string(),
      narratorName: z.string(),
      isParentVoice: z.boolean(),
      duration: z.number().nullable(),
    })
    .nullable(),
  createdAt: z.string(),
});
export type StorySummary = z.infer<typeof storySummarySchema>;

export const storyDetailSchema = storySummarySchema.extend({
  ageRange: ageRangeSchema,
  summary: z.string().nullable(),
  storyText: z.string().nullable(),
  moderationStatus: moderationStatusSchema,
  version: z.number().int(),
  pages: z.array(storyPageSchema),
  playbackPosition: z
    .object({ narrationId: z.string(), positionSeconds: z.number() })
    .nullable(),
});
export type StoryDetail = z.infer<typeof storyDetailSchema>;

export const playbackPositionSchema = z.object({
  narrationId: z.string().cuid(),
  positionSeconds: z.number().min(0),
});
export type PlaybackPositionInput = z.infer<typeof playbackPositionSchema>;

/**
 * Structured output contract for the story LLM.
 * The provider must return exactly this JSON; invalid responses trigger a repair retry.
 */
export const generatedStorySchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(600),
  coverIllustrationPrompt: z.string().min(1).max(1000),
  pages: z
    .array(
      z.object({
        pageNumber: z.number().int().min(1),
        text: z.string().min(1).max(2200),
        illustrationPrompt: z.string().min(1).max(1000),
      }),
    )
    .min(3)
    .max(20),
});
export type GeneratedStory = z.infer<typeof generatedStorySchema>;
