import { Module } from '@nestjs/common';
import { StoriesModule } from '../stories/stories.module';
import { VoicesModule } from '../voices/voices.module';
import { NarrationsService } from './narrations.service';
import { NarrationsController } from './narrations.controller';
import { NarrationProcessor } from './narration.processor';

/** Narrations: chunked TTS + ffmpeg concat + timings (§19/§6a). */
@Module({
  imports: [StoriesModule, VoicesModule],
  controllers: [NarrationsController],
  providers: [NarrationsService, NarrationProcessor],
  exports: [NarrationsService],
})
export class NarrationsModule {}
