import { createZodDto } from 'nestjs-zod';
import { avatarUploadSchema, voiceRecordingUploadSchema } from '@masalim/validation';

export class VoiceRecordingUploadDto extends createZodDto(voiceRecordingUploadSchema) {}
export class AvatarUploadDto extends createZodDto(avatarUploadSchema) {}
