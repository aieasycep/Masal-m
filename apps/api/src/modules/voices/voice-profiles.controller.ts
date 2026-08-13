import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import {
  createVoiceProfileSchema,
  recreateVoiceProfileSchema,
  updateVoiceProfileSchema,
  type VoiceProfile,
} from '@masalim/validation';
import type { VoiceCloneProvider } from '@masalim/ai';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-auth.guard';
import { VOICE_CLONE } from '../../providers/providers.module';
import { VoiceProfilesService } from './voice-profiles.service';

class CreateVoiceProfileDto extends createZodDto(createVoiceProfileSchema) {}
class UpdateVoiceProfileDto extends createZodDto(updateVoiceProfileSchema) {}
class RecreateVoiceProfileDto extends createZodDto(recreateVoiceProfileSchema) {}

@ApiTags('voices')
@Controller('voices')
export class VoiceProfilesController {
  constructor(
    private readonly voiceProfiles: VoiceProfilesService,
    @Inject(VOICE_CLONE) private readonly voiceClone: VoiceCloneProvider,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<VoiceProfile[]> {
    return this.voiceProfiles.list(user.id);
  }

  /** Strict bucket (§86): cloning is expensive and premium-gated. */
  @Throttle({ default: { ttl: seconds(60), limit: 10 } })
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateVoiceProfileDto,
  ): Promise<VoiceProfile> {
    return this.voiceProfiles.create(user.id, body);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateVoiceProfileDto,
  ): Promise<VoiceProfile> {
    return this.voiceProfiles.rename(user.id, id, body.displayName);
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.voiceProfiles.remove(user.id, id, (providerVoiceId) =>
      this.voiceClone.deleteVoice(providerVoiceId),
    );
  }

  @Post(':id/preview')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ previewUrl: string }> {
    return this.voiceProfiles.preview(user.id, id);
  }

  @Throttle({ default: { ttl: seconds(60), limit: 10 } })
  @Post(':id/recreate')
  recreate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: RecreateVoiceProfileDto,
  ): Promise<VoiceProfile> {
    return this.voiceProfiles.recreate(user.id, id, body);
  }
}
