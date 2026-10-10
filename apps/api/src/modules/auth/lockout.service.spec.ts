import type Redis from 'ioredis';
import { AppException } from '../../common/errors/app.exception';
import {
  LockoutService,
  MAX_FAILED_ATTEMPTS_PER_EMAIL,
  MAX_FAILED_ATTEMPTS_PER_IP,
  MAX_RESET_CODE_ATTEMPTS,
} from './lockout.service';

/** Minimal in-memory Redis: only the commands LockoutService issues. */
function buildRedis() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  const redis = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    incr: jest.fn(async (key: string) => {
      const next = parseInt(store.get(key) ?? '0', 10) + 1;
      store.set(key, String(next));
      return next;
    }),
    expire: jest.fn(async (key: string, seconds: number) => {
      ttls.set(key, seconds);
      return 1;
    }),
    del: jest.fn(async (...keys: string[]) => {
      let removed = 0;
      for (const key of keys) {
        if (store.delete(key)) removed += 1;
        ttls.delete(key);
      }
      return removed;
    }),
  };
  return { redis: redis as unknown as Redis, store, ttls };
}

const EMAIL = 'victim@test.local';

describe('LockoutService', () => {
  it('locks one client after the per-ip limit but leaves other clients alone', async () => {
    const { redis } = buildRedis();
    const service = new LockoutService(redis);

    for (let i = 0; i < MAX_FAILED_ATTEMPTS_PER_IP; i += 1) {
      await service.recordFailure(EMAIL, '10.0.0.1');
    }

    await expect(service.assertNotLockedOut(EMAIL, '10.0.0.1')).rejects.toBeInstanceOf(
      AppException,
    );
    // the account owner on another network is still able to try
    await expect(service.assertNotLockedOut(EMAIL, '10.0.0.2')).resolves.toBeUndefined();
  });

  it('is not locked one failure short of the per-ip limit', async () => {
    const { redis } = buildRedis();
    const service = new LockoutService(redis);

    for (let i = 0; i < MAX_FAILED_ATTEMPTS_PER_IP - 1; i += 1) {
      await service.recordFailure(EMAIL, '10.0.0.1');
    }

    await expect(service.assertNotLockedOut(EMAIL, '10.0.0.1')).resolves.toBeUndefined();
  });

  it('caps an account across many ips (distributed guessing)', async () => {
    const { redis } = buildRedis();
    const service = new LockoutService(redis);

    // one failure per ip never trips the per-ip lock, only the account cap
    for (let i = 0; i < MAX_FAILED_ATTEMPTS_PER_EMAIL; i += 1) {
      await service.recordFailure(EMAIL, `10.1.${Math.floor(i / 250)}.${i % 250}`);
    }

    await expect(service.assertNotLockedOut(EMAIL, '192.168.0.9')).rejects.toMatchObject({
      code: 'AUTH_LOCKED_OUT',
      status: 429,
    });
  });

  it('starts both windows at the first failure only', async () => {
    const { redis, ttls } = buildRedis();
    const service = new LockoutService(redis);

    await service.recordFailure(EMAIL, '10.0.0.1');
    await service.recordFailure(EMAIL, '10.0.0.1');

    expect(ttls.get(`auth:lockout:ip:${EMAIL}:10.0.0.1`)).toBe(15 * 60);
    expect(ttls.get(`auth:lockout:email:${EMAIL}`)).toBe(15 * 60);
    expect(redis.expire).toHaveBeenCalledTimes(2);
  });

  it('reset clears both the ip counter and the account cap', async () => {
    const { redis, store } = buildRedis();
    const service = new LockoutService(redis);

    for (let i = 0; i < MAX_FAILED_ATTEMPTS_PER_IP; i += 1) {
      await service.recordFailure(EMAIL, '10.0.0.1');
    }
    await service.reset(EMAIL, '10.0.0.1');

    expect(store.size).toBe(0);
    await expect(service.assertNotLockedOut(EMAIL, '10.0.0.1')).resolves.toBeUndefined();
  });

  it('reset without an ip clears only the account cap', async () => {
    const { redis, store } = buildRedis();
    const service = new LockoutService(redis);

    await service.recordFailure(EMAIL, '10.0.0.1');
    await service.reset(EMAIL);

    expect(store.has(`auth:lockout:email:${EMAIL}`)).toBe(false);
    expect(store.has(`auth:lockout:ip:${EMAIL}:10.0.0.1`)).toBe(true);
  });

  it('reports the reset-code budget as exhausted at the cap and clears it on demand', async () => {
    const { redis, ttls } = buildRedis();
    const service = new LockoutService(redis);

    for (let i = 0; i < MAX_RESET_CODE_ATTEMPTS - 1; i += 1) {
      expect(await service.recordResetFailure('user-1')).toBe(false);
    }
    expect(await service.resetAttemptsExhausted('user-1')).toBe(false);
    expect(await service.recordResetFailure('user-1')).toBe(true);
    expect(await service.resetAttemptsExhausted('user-1')).toBe(true);
    expect(ttls.get('auth:reset-attempts:user-1')).toBe(15 * 60);

    await service.clearResetAttempts('user-1');
    expect(await service.resetAttemptsExhausted('user-1')).toBe(false);
  });
});
