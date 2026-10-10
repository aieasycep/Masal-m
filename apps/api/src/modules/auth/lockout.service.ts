import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { EMAIL_VERIFICATION, ErrorCode } from '@masalim/types';
import { REDIS } from '../../redis/redis.module';
import { AppException } from '../../common/errors/app.exception';

/** Failed logins from one client against one account before it is throttled. */
export const MAX_FAILED_ATTEMPTS_PER_IP = 8;
/** Failed logins against one account from anywhere — a cap, not the primary lock. */
export const MAX_FAILED_ATTEMPTS_PER_EMAIL = 40;
const LOCKOUT_WINDOW_SECONDS = 15 * 60;

/** Wrong password-reset codes an account may see before every outstanding code is burnt. */
export const MAX_RESET_CODE_ATTEMPTS = 5;
/** Reset codes and their guess counter share one lifetime. */
export const RESET_CODE_TTL_SECONDS = 15 * 60;

/** One-time-code flows that share the guess-budget mechanics. */
export type CodeScope = 'reset' | 'verify';

const CODE_BUDGETS: Record<CodeScope, { maxAttempts: number; windowSeconds: number }> = {
  reset: { maxAttempts: MAX_RESET_CODE_ATTEMPTS, windowSeconds: RESET_CODE_TTL_SECONDS },
  verify: {
    maxAttempts: EMAIL_VERIFICATION.MAX_ATTEMPTS,
    windowSeconds: EMAIL_VERIFICATION.CODE_TTL_SECONDS,
  },
};

/**
 * Brute-force protection in Redis (§11, §45).
 *
 * Login failures are counted per email+ip (the real lock) and per email (a
 * wide cap for distributed guessing). Keying by email alone would let anyone
 * lock a victim out by sending junk passwords.
 *
 * One-time codes (password reset, e-mail verification) get a per-account
 * guess budget keyed by scope; the counter's window equals the code lifetime.
 */
@Injectable()
export class LockoutService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private ipKey(email: string, ip: string): string {
    return `auth:lockout:ip:${email}:${ip}`;
  }

  private emailKey(email: string): string {
    return `auth:lockout:email:${email}`;
  }

  private codeKey(scope: CodeScope, userId: string): string {
    return `auth:${scope}-attempts:${userId}`;
  }

  async assertNotLockedOut(email: string, ip: string): Promise<void> {
    const [perIp, perEmail] = await Promise.all([
      this.count(this.ipKey(email, ip)),
      this.count(this.emailKey(email)),
    ]);
    if (perIp >= MAX_FAILED_ATTEMPTS_PER_IP || perEmail >= MAX_FAILED_ATTEMPTS_PER_EMAIL) {
      throw new AppException(
        ErrorCode.AUTH_LOCKED_OUT,
        'Too many failed attempts, try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    await this.bump(this.ipKey(email, ip), LOCKOUT_WINDOW_SECONDS);
    await this.bump(this.emailKey(email), LOCKOUT_WINDOW_SECONDS);
  }

  /** Clears the account-wide cap and, when the caller knows it, the client's own counter. */
  async reset(email: string, ip?: string): Promise<void> {
    const keys = [this.emailKey(email)];
    if (ip != null) keys.push(this.ipKey(email, ip));
    await this.redis.del(...keys);
  }

  async codeAttemptsExhausted(scope: CodeScope, userId: string): Promise<boolean> {
    return (await this.count(this.codeKey(scope, userId))) >= CODE_BUDGETS[scope].maxAttempts;
  }

  /** Counts a wrong code; returns the attempts so far (≥ max ⇒ the budget is spent). */
  async recordCodeFailure(scope: CodeScope, userId: string): Promise<number> {
    return this.bump(this.codeKey(scope, userId), CODE_BUDGETS[scope].windowSeconds);
  }

  async clearCodeAttempts(scope: CodeScope, userId: string): Promise<void> {
    await this.redis.del(this.codeKey(scope, userId));
  }

  // ── password-reset wrappers (kept for the existing reset flow) ──────────────

  async resetAttemptsExhausted(userId: string): Promise<boolean> {
    return this.codeAttemptsExhausted('reset', userId);
  }

  /** Counts a wrong reset code; true once the account has hit the guess cap. */
  async recordResetFailure(userId: string): Promise<boolean> {
    return (await this.recordCodeFailure('reset', userId)) >= MAX_RESET_CODE_ATTEMPTS;
  }

  async clearResetAttempts(userId: string): Promise<void> {
    await this.clearCodeAttempts('reset', userId);
  }

  private async count(key: string): Promise<number> {
    const raw = await this.redis.get(key);
    return raw == null ? 0 : parseInt(raw, 10);
  }

  /**
   * INCR + EXPIRE NX in one round trip: the window starts at the first failure
   * and is not extended by later ones. A separate `if (attempts === 1) expire`
   * left a counter without a TTL whenever the process died in between — a
   * permanent lockout.
   */
  private async bump(key: string, windowSeconds: number): Promise<number> {
    const results = await this.redis.multi().incr(key).expire(key, windowSeconds, 'NX').exec();
    const [incrError, attempts] = results?.[0] ?? [new Error('redis multi returned nothing'), 0];
    if (incrError != null) throw incrError;
    return Number(attempts);
  }
}
