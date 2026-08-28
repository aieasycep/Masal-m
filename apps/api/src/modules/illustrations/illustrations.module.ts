import { Module } from '@nestjs/common';
import { StoriesModule } from '../stories/stories.module';
import { IllustrationsService } from './illustrations.service';
import { IllustrationsController } from './illustrations.controller';
import { IllustrationProcessor } from './illustration.processor';

/** Illustrations: style sets with character-sheet-first consistency (§26–§27). */
@Module({
  imports: [StoriesModule],
  controllers: [IllustrationsController],
  providers: [IllustrationsService, IllustrationProcessor],
  exports: [IllustrationsService],
})
export class IllustrationsModule {}
