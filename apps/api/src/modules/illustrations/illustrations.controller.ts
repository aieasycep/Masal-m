import { Body, Controller, Param, Patch, Post, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import {
  createIllustrationSetSchema,
  selectIllustrationSchema,
  type Illustration,
  type IllustrationSet,
} from '@masalim/validation';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-auth.guard';
import { IllustrationsService } from './illustrations.service';

class CreateIllustrationSetDto extends createZodDto(createIllustrationSetSchema) {}
class SelectIllustrationDto extends createZodDto(selectIllustrationSchema) {}

@ApiTags('illustrations')
@Controller()
export class IllustrationsController {
  constructor(private readonly illustrations: IllustrationsService) {}

  @Get('stories/:storyId/illustrations')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('storyId') storyId: string,
  ): Promise<IllustrationSet[]> {
    return this.illustrations.list(user.id, storyId);
  }

  /** Strict bucket (§86): image generation is the priciest provider call. */
  @Throttle({ default: { ttl: seconds(60), limit: 4 } })
  @Post('stories/:storyId/illustrations')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('storyId') storyId: string,
    @Body() body: CreateIllustrationSetDto,
  ): Promise<{ set: IllustrationSet; jobId: string | null }> {
    return this.illustrations.create(user.id, storyId, body);
  }

  @Patch('illustrations/:id')
  select(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() _body: SelectIllustrationDto,
  ): Promise<Illustration> {
    return this.illustrations.select(user.id, id);
  }

  @Throttle({ default: { ttl: seconds(60), limit: 6 } })
  @Post('illustrations/:id/regenerate')
  regenerate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ jobId: string }> {
    return this.illustrations.regenerate(user.id, id);
  }
}
