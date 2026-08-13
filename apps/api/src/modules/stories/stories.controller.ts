import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import type { StoryDetail, StorySummary, PaginatedMeta } from '@masalim/validation';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-auth.guard';
import { StoriesService } from './stories.service';
import {
  CreateStoryDto,
  ListStoriesQueryDto,
  PlaybackPositionDto,
  UpdateStoryDto,
} from './stories.dto';

@ApiTags('stories')
@Controller('stories')
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListStoriesQueryDto,
  ): Promise<{ items: StorySummary[]; meta: PaginatedMeta }> {
    return this.stories.list(user.id, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateStoryDto,
  ): Promise<StoryDetail> {
    return this.stories.create(user.id, body);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<StoryDetail> {
    return this.stories.detail(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateStoryDto,
  ): Promise<StoryDetail> {
    return this.stories.update(user.id, id, body);
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.stories.remove(user.id, id);
  }

  /** Strict bucket (§86): generation is the most expensive call in the app. */
  @Throttle({ default: { ttl: seconds(60), limit: 6 } })
  @Post(':id/generate')
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ jobId: string }> {
    return this.stories.generate(user.id, id);
  }

  @Post(':id/duplicate')
  duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<StoryDetail> {
    return this.stories.duplicate(user.id, id);
  }

  @HttpCode(204)
  @Put(':id/favorite')
  async favorite(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.stories.setFavorite(user.id, id, true);
  }

  @HttpCode(204)
  @Delete(':id/favorite')
  async unfavorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.stories.setFavorite(user.id, id, false);
  }

  @HttpCode(204)
  @Put(':id/playback-position')
  async playbackPosition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: PlaybackPositionDto,
  ): Promise<void> {
    await this.stories.setPlaybackPosition(user.id, id, body);
  }
}
