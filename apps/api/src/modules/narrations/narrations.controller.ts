import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import { createNarrationSchema, type Narration } from '@masalim/validation';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-auth.guard';
import { NarrationsService } from './narrations.service';

class CreateNarrationDto extends createZodDto(createNarrationSchema) {}

@ApiTags('narrations')
@Controller('stories/:storyId/narrations')
export class NarrationsController {
  constructor(private readonly narrations: NarrationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('storyId') storyId: string,
  ): Promise<Narration[]> {
    return this.narrations.list(user.id, storyId);
  }

  /** Strict bucket (§86): TTS is provider-billed. */
  @Throttle({ default: { ttl: seconds(60), limit: 6 } })
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('storyId') storyId: string,
    @Body() body: CreateNarrationDto,
  ): Promise<{ narration: Narration; jobId: string | null }> {
    return this.narrations.create(user.id, storyId, body);
  }
}
