import { z } from 'zod';
import { AIJobStatus, AIJobType } from '@masalim/types';

export const aiJobTypeSchema = z.nativeEnum(AIJobType);
export const aiJobStatusSchema = z.nativeEnum(AIJobStatus);

export const aiJobSchema = z.object({
  id: z.string(),
  type: aiJobTypeSchema,
  entityId: z.string().nullable(),
  status: aiJobStatusSchema,
  /** Real progress 0–100, driven by worker milestones — never fabricated client-side. */
  progress: z.number().int().min(0).max(100),
  errorCode: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AIJob = z.infer<typeof aiJobSchema>;

/** SSE event payload on /jobs/:id/stream. */
export const jobStreamEventSchema = aiJobSchema.pick({
  id: true,
  status: true,
  progress: true,
  errorCode: true,
});
export type JobStreamEvent = z.infer<typeof jobStreamEventSchema>;
