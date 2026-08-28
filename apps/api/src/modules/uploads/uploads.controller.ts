import { Body, Controller, Inject, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { StorageKeys, StorageProvider } from '@masalim/storage';
import type { SignedUploadResponse } from '@masalim/validation';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-auth.guard';
import { STORAGE } from '../../providers/providers.module';
import { AvatarUploadDto, VoiceRecordingUploadDto } from './uploads.dto';

/** Signed PUT URLs — MIME allowlist + size caps enforced by the DTO schemas (§45). */
@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(@Inject(STORAGE) private readonly storage: StorageProvider) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('voice-recordings')
  voiceRecording(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: VoiceRecordingUploadDto,
  ): Promise<SignedUploadResponse> {
    return this.storage.createSignedUpload({
      keyPrefix: StorageKeys.voiceRecording(user.id),
      contentType: body.contentType,
      contentLength: body.contentLength,
    });
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('avatars')
  avatar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AvatarUploadDto,
  ): Promise<SignedUploadResponse> {
    return this.storage.createSignedUpload({
      keyPrefix: StorageKeys.avatar(user.id),
      contentType: body.contentType,
      contentLength: body.contentLength,
    });
  }
}
