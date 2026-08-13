import { z } from 'zod';
import { NarrationStatus } from '@masalim/types';

export const narrationStatusSchema = z.nativeEnum(NarrationStatus);

export const createNarrationSchema = z
  .object({
    voiceProfileId: z.string().cuid().optional(),
    systemVoiceId: z.string().cuid().optional(),
  })
  .refine((v) => (v.voiceProfileId != null) !== (v.systemVoiceId != null), {
    message: 'exactly_one_voice_required',
    path: ['voiceProfileId'],
  });
export type CreateNarrationInput = z.infer<typeof createNarrationSchema>;

export const narrationTimingSchema = z.object({
  /** Index of the story page this chunk belongs to (1-based pageNumber). */
  pageNumber: z.number().int().min(1),
  /** Character offset of the chunk inside the full story text. */
  charStart: z.number().int().min(0),
  charEnd: z.number().int().min(0),
  /** Start time of this chunk in the final concatenated audio, in seconds. */
  startSeconds: z.number().min(0),
  durationSeconds: z.number().min(0),
});
export type NarrationTiming = z.infer<typeof narrationTimingSchema>;

export const narrationSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  storyVersion: z.number().int(),
  narratorName: z.string(),
  isParentVoice: z.boolean(),
  voiceProfileId: z.string().nullable(),
  systemVoiceId: z.string().nullable(),
  audioUrl: z.string().nullable(),
  duration: z.number().nullable(),
  timings: z.array(narrationTimingSchema).nullable(),
  status: narrationStatusSchema,
  createdAt: z.string(),
  jobId: z.string().nullable(),
});
export type Narration = z.infer<typeof narrationSchema>;
