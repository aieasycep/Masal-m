import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import { analyticsBatchSchema } from '@masalim/validation';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

class AnalyticsBatchDto extends createZodDto(analyticsBatchSchema) {}

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Throttle({ default: { ttl: seconds(60), limit: 30 } })
  @Post('events')
  @HttpCode(202)
  ingest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AnalyticsBatchDto,
  ): { accepted: number; dropped: number } {
    return this.analytics.ingest(user.id, body);
  }
}
