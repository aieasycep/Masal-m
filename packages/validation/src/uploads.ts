import { z } from 'zod';
import { AVATAR_UPLOAD, VOICE_RECORDING } from '@masalim/types';

export const voiceRecordingUploadSchema = z.object({
  contentType: z.enum(VOICE_RECORDING.ACCEPTED_MIME_TYPES),
  contentLength: z
    .number()
    .int()
    .min(1)
    .max(VOICE_RECORDING.MAX_UPLOAD_BYTES),
});
export type VoiceRecordingUploadInput = z.infer<typeof voiceRecordingUploadSchema>;

export const avatarUploadSchema = z.object({
  contentType: z.enum(AVATAR_UPLOAD.ACCEPTED_MIME_TYPES),
  contentLength: z.number().int().min(1).max(AVATAR_UPLOAD.MAX_UPLOAD_BYTES),
});
export type AvatarUploadInput = z.infer<typeof avatarUploadSchema>;

export const signedUploadResponseSchema = z.object({
  uploadUrl: z.string(),
  objectKey: z.string(),
  /** Seconds until the signed PUT URL expires. */
  expiresIn: z.number().int(),
  headers: z.record(z.string(), z.string()),
});
export type SignedUploadResponse = z.infer<typeof signedUploadResponseSchema>;
