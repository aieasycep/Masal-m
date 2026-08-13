import { Module } from '@nestjs/common';
import { ChildrenModule } from '../children/children.module';
import { StoriesService } from './stories.service';
import { StoriesController } from './stories.controller';
import { StoryGenerationProcessor } from './story-generation.processor';

/** Stories: CRUD + two-phase generation pipeline (§16–§17). */
@Module({
  imports: [ChildrenModule],
  controllers: [StoriesController],
  providers: [StoriesService, StoryGenerationProcessor],
  exports: [StoriesService],
})
export class StoriesModule {}
