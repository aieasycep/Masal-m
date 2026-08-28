import { Module } from '@nestjs/common';
import { SystemVoicesService } from './system-voices.service';
import { SystemVoicesController } from './system-voices.controller';
import { VoiceProfilesService } from './voice-profiles.service';
import { VoiceProfilesController } from './voice-profiles.controller';
import { VoiceCloneProcessor } from './voice-clone.processor';

/**
 * Voices: system-voice catalogue + personal voice profiles with consent-gated
 * cloning (§20–§21) and the retention policy (§46).
 * Route order matters: SystemVoicesController owns /voices/system and must be
 * registered before the /voices/:id routes.
 */
@Module({
  controllers: [SystemVoicesController, VoiceProfilesController],
  providers: [SystemVoicesService, VoiceProfilesService, VoiceCloneProcessor],
  exports: [SystemVoicesService, VoiceProfilesService],
})
export class VoicesModule {}
