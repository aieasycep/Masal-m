import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import Redis from 'ioredis';
import { Public } from '../../common/auth/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';

type Probe = 'up' | 'down';

/**
 * Liveness + dependency probe. Returns 200 `{status:'ok'}` only when Postgres
 * AND Redis answer; otherwise 503 `{status:'degraded'}` so the compose
 * healthcheck and the deploy workflow's `curl -f` fail instead of passing a
 * half-dead API. Exempt from the global rate limit (orchestrators poll it).
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Public()
  @SkipThrottle()
  @Get()
  async health(
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ status: 'ok' | 'degraded'; db: Probe; redis: Probe }> {
    const db: Probe = await this.prisma.$queryRaw`SELECT 1`.then(
      () => 'up' as const,
      () => 'down' as const,
    );
    const redis: Probe = await this.redis.ping().then(
      () => 'up' as const,
      () => 'down' as const,
    );
    const ok = db === 'up' && redis === 'up';
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: ok ? 'ok' : 'degraded', db, redis };
  }
}
