import { Module } from '@nestjs/common';
import { SystemVoicesService } from './system-voices.service';
import { SystemVoicesController } from './system-voices.controller';

/**
 * Voice module — Phase 3 ships the system-voice catalogue (wizard step 5);
 * personal voice-profile CRUD and cloning land with the voice studio phase.
 */
@Module({
  controllers: [SystemVoicesController],
  providers: [SystemVoicesService],
  exports: [SystemVoicesService],
})
export class VoicesModule {}
