import { createZodDto } from 'nestjs-zod';
import {
  createStorySchema,
  listStoriesQuerySchema,
  playbackPositionSchema,
  updateStorySchema,
} from '@masalim/validation';

export class CreateStoryDto extends createZodDto(createStorySchema) {}
export class UpdateStoryDto extends createZodDto(updateStorySchema) {}
export class ListStoriesQueryDto extends createZodDto(listStoriesQuerySchema) {}
export class PlaybackPositionDto extends createZodDto(playbackPositionSchema) {}
