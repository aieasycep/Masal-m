import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { ErrorCode } from '@masalim/types';
import { REDIS } from '../../redis/redis.module';
import { AppException } from '../../common/errors/app.exception';

const MAX_FAILED_ATTEMPTS = 8;
const WINDOW_SECONDS = 15 * 60;

/** Brute-force protection: per-account failed-login counter in Redis (§11, §45). */
@Injectable()
export class LockoutService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key(email: string): string {
    return `auth:lockout:${email}`;
  }

  async assertNotLockedOut(email: string): Promise<void> {
    const attempts = await this.redis.get(this.key(email));
    if (attempts != null && parseInt(attempts, 10) >= MAX_FAILED_ATTEMPTS) {
      throw new AppException(
        ErrorCode.AUTH_LOCKED_OUT,
        'Too many failed attempts, try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordFailure(email: string): Promise<void> {
    const key = this.key(email);
    const attempts = await this.redis.incr(key);
    if (attempts === 1) {
      await this.redis.expire(key, WINDOW_SECONDS);
    }
  }

  async reset(email: string): Promise<void> {
    await this.redis.del(this.key(email));
  }
}
