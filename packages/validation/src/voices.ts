import { z } from 'zod';
import { SystemVoiceCategory, VoiceOwnerType, VoiceProfileStatus } from '@masalim/types';

export const voiceOwnerTypeSchema = z.nativeEnum(VoiceOwnerType);
export const voiceProfileStatusSchema = z.nativeEnum(VoiceProfileStatus);
export const systemVoiceCategorySchema = z.nativeEnum(SystemVoiceCategory);

export const createVoiceProfileSchema = z.object({
  ownerType: voiceOwnerTypeSchema,
  displayName: z.string().trim().min(1).max(60),
  /** Storage object key returned by the signed-upload flow. */
  recordingObjectKey: z.string().min(1).max(512),
  recordingDurationSeconds: z.number().min(1).max(600),
  /**
   * Explicit consent (§21): must be literal true. The backend also re-checks
   * and stamps consentAcceptedAt server-side; a false/missing value is rejected.
   */
  consentAccepted: z.literal(true),
});
export type CreateVoiceProfileInput = z.infer<typeof createVoiceProfileSchema>;

export const updateVoiceProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
});
export type UpdateVoiceProfileInput = z.infer<typeof updateVoiceProfileSchema>;

export const recreateVoiceProfileSchema = z.object({
  recordingObjectKey: z.string().min(1).max(512),
  recordingDurationSeconds: z.number().min(1).max(600),
  consentAccepted: z.literal(true),
});
export type RecreateVoiceProfileInput = z.infer<typeof recreateVoiceProfileSchema>;

export const voiceProfileSchema = z.object({
  id: z.string(),
  ownerType: voiceOwnerTypeSchema,
  displayName: z.string(),
  status: voiceProfileStatusSchema,
  previewUrl: z.string().nullable(),
  consentAcceptedAt: z.string(),
  createdAt: z.string(),
  jobId: z.string().nullable(),
});
export type VoiceProfile = z.infer<typeof voiceProfileSchema>;

export const systemVoiceSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  category: systemVoiceCategorySchema,
  previewUrl: z.string().nullable(),
  premiumOnly: z.boolean(),
});
export type SystemVoice = z.infer<typeof systemVoiceSchema>;
