import { createHash } from 'node:crypto';
import * as argon2 from 'argon2';
import type Redis from 'ioredis';
import { AuthProvider, CreditReason, ErrorCode, SIGNUP_GIFT_CREDITS } from '@masalim/types';
import type { User } from '@masalim/database';
import { AppException } from '../../common/errors/app.exception';
import type { Env } from '../../config/env';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MailMessage, MailService } from '../../providers/mail.service';
import type { EntitlementService } from '../subscription/entitlement.service';
import { AuthService } from './auth.service';
import { LockoutService, MAX_RESET_CODE_ATTEMPTS } from './lockout.service';
import type { SocialVerifyService, VerifiedSocialIdentity } from './social-verify.service';
import type { TokenService } from './token.service';

type IdentityRow = { id: string; userId: string; provider: AuthProvider; providerUserId: string };
type CodeRow = {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};
type VerificationRow = CodeRow & { email: string };
type DeletionRow = { id: string; userId: string; scope: string; status: string };

function makeUser(overrides: Partial<User> & { id: string; email: string }): User {
  return {
    name: 'Test',
    passwordHash: null,
    avatarKey: null,
    locale: 'tr',
    timezone: null,
    onboardingCompleted: false,
    emailVerifiedAt: null,
    notificationPrefs: {},
    subscriptionPlan: 'FREE',
    creditBalance: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as User;
}

/** In-memory Prisma covering exactly the queries AuthService runs. */
function buildPrisma(seed: {
  users?: User[];
  identities?: IdentityRow[];
  deletions?: DeletionRow[];
}) {
  const state = {
    users: [...(seed.users ?? [])],
    identities: [...(seed.identities ?? [])],
    resets: [] as CodeRow[],
    verifications: [] as VerificationRow[],
    deletions: [...(seed.deletions ?? [])],
  };
  let nextId = 1;
  const id = (prefix: string) => `${prefix}-${nextId++}`;

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
        state.users.find((u) =>
          where.email != null ? u.email === where.email : u.id === where.id,
        ) ?? null,
      create: async ({
        data,
      }: {
        data: {
          email: string;
          name: string;
          passwordHash?: string;
          emailVerifiedAt?: Date | null;
          identities?: { create: { provider: AuthProvider; providerUserId: string } };
        };
      }) => {
        if (state.users.some((u) => u.email === data.email)) {
          throw new Error('P2002 unique email');
        }
        const user = makeUser({
          id: id('user'),
          email: data.email,
          name: data.name,
          emailVerifiedAt: data.emailVerifiedAt ?? null,
        });
        state.users.push(user);
        if (data.identities) {
          state.identities.push({ id: id('ident'), userId: user.id, ...data.identities.create });
        }
        return user;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<User> }) => {
        const user = state.users.find((u) => u.id === where.id);
        if (user) Object.assign(user, data);
        return user;
      },
      updateMany: async ({ where, data }: { where: { id: string }; data: { deletedAt: null } }) => {
        const user = state.users.find((u) => u.id === where.id && u.deletedAt != null);
        if (user) user.deletedAt = data.deletedAt;
        return { count: user ? 1 : 0 };
      },
    },
    authIdentity: {
      findUnique: async ({
        where,
      }: {
        where: { provider_providerUserId: { provider: AuthProvider; providerUserId: string } };
      }) => {
        const key = where.provider_providerUserId;
        const row = state.identities.find(
          (i) => i.provider === key.provider && i.providerUserId === key.providerUserId,
        );
        if (row == null) return null;
        return { ...row, user: state.users.find((u) => u.id === row.userId)! };
      },
      create: async ({
        data,
      }: {
        data: { userId: string; provider: AuthProvider; providerUserId: string };
      }) => {
        const row = { id: id('ident'), ...data };
        state.identities.push(row);
        return row;
      },
    },
    passwordReset: codeTable(state.resets, () => id('reset')),
    emailVerification: codeTable(state.verifications, () => id('verify')),
    deletionRequest: {
      findFirst: async ({ where }: { where: { userId: string; scope: string; status: string } }) =>
        state.deletions.find(
          (d) => d.userId === where.userId && d.scope === where.scope && d.status === where.status,
        ) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId: string; scope: string; status: string };
        data: { status: string };
      }) => {
        let count = 0;
        for (const row of state.deletions) {
          if (
            row.userId === where.userId &&
            row.scope === where.scope &&
            row.status === where.status
          ) {
            row.status = data.status;
            count += 1;
          }
        }
        return { count };
      },
    },
    // Fakes are already serialised; the transaction only awaits its members.
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { prisma: prisma as unknown as PrismaService, state };
}

/** passwordReset and emailVerification share one shape and one query set. */
function codeTable<Row extends CodeRow>(rows: Row[], nextId: () => string) {
  return {
    create: async ({ data }: { data: Omit<Row, 'id' | 'usedAt' | 'createdAt'> }) => {
      const row = { id: nextId(), usedAt: null, createdAt: new Date(), ...data } as Row;
      rows.push(row);
      return row;
    },
    findFirst: async ({
      where,
    }: {
      where: {
        userId: string;
        email?: string;
        codeHash: string;
        usedAt: null;
        expiresAt: { gt: Date };
      };
    }) =>
      rows.find(
        (r) =>
          r.userId === where.userId &&
          (where.email == null || (r as VerificationRow).email === where.email) &&
          r.codeHash === where.codeHash &&
          r.usedAt === null &&
          r.expiresAt > where.expiresAt.gt,
      ) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: { usedAt: Date } }) => {
      const row = rows.find((r) => r.id === where.id);
      if (row) row.usedAt = data.usedAt;
      return row;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { userId: string; usedAt: null };
      data: { usedAt: Date };
    }) => {
      let count = 0;
      for (const row of rows) {
        if (row.userId === where.userId && row.usedAt === null) {
          row.usedAt = data.usedAt;
          count += 1;
        }
      }
      return { count };
    },
  };
}

/** In-memory Redis: the commands AuthService + LockoutService issue. */
function buildRedis() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  const incr = async (key: string) => {
    const next = parseInt(store.get(key) ?? '0', 10) + 1;
    store.set(key, String(next));
    return next;
  };
  const expire = async (key: string, seconds: number, mode?: 'NX') => {
    if (mode === 'NX' && ttls.has(key)) return 0;
    ttls.set(key, seconds);
    return 1;
  };
  const redis = {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string, ...args: Array<string | number>) => {
      if (args.includes('NX') && store.has(key)) return null;
      store.set(key, value);
      const ex = args.indexOf('EX');
      if (ex >= 0) ttls.set(key, Number(args[ex + 1]));
      return 'OK';
    },
    getdel: async (key: string) => {
      const value = store.get(key) ?? null;
      store.delete(key);
      ttls.delete(key);
      return value;
    },
    ttl: async (key: string) => ttls.get(key) ?? -2,
    incr,
    expire,
    del: async (...keys: string[]) => {
      let removed = 0;
      for (const key of keys) {
        if (store.delete(key)) removed += 1;
        ttls.delete(key);
      }
      return removed;
    },
    multi: () => {
      const ops: Array<() => Promise<unknown>> = [];
      const chain = {
        incr: (key: string) => {
          ops.push(() => incr(key));
          return chain;
        },
        expire: (key: string, seconds: number, mode?: 'NX') => {
          ops.push(() => expire(key, seconds, mode));
          return chain;
        },
        exec: async () => {
          const results: Array<[Error | null, unknown]> = [];
          for (const op of ops) results.push([null, await op()]);
          return results;
        },
      };
      return chain;
    },
  };
  return { redis: redis as unknown as Redis, store };
}

function buildService(
  seed: { users?: User[]; identities?: IdentityRow[]; deletions?: DeletionRow[] },
  identity?: VerifiedSocialIdentity,
  options: { mailProvider?: 'mock' | 'smtp' } = {},
) {
  const { prisma, state } = buildPrisma(seed);
  const { redis, store: redisStore } = buildRedis();
  const sent: MailMessage[] = [];
  const revokeAllForUser = jest.fn(async () => undefined);
  const tokens = {
    issueTokens: async (user: { id: string }) => ({
      accessToken: `access-${user.id}`,
      refreshToken: `refresh-${user.id}`,
      accessTokenExpiresAt: 0,
    }),
    revokeAllForUser,
  } as unknown as TokenService;
  const verifyApple = jest.fn(async () => identity);
  const social = {
    verifyGoogle: async () => identity,
    verifyApple,
  } as unknown as SocialVerifyService;
  const mail = {
    send: async (message: MailMessage) => void sent.push(message),
  } as unknown as MailService;
  // Idempotent on the ledger key, exactly like the real EntitlementService.
  const grantedKeys = new Set<string>();
  const grantCredits = jest.fn(
    async (_userId: string, _amount: number, _reason: string, _ref: unknown, key: string) => {
      if (grantedKeys.has(key)) return false;
      grantedKeys.add(key);
      return true;
    },
  );
  const entitlements = { grantCredits } as unknown as EntitlementService;
  const env = { MAIL_PROVIDER: options.mailProvider ?? 'mock' } as Env;

  const service = new AuthService(
    prisma,
    tokens,
    social,
    new LockoutService(redis),
    mail,
    entitlements,
    env,
    redis,
  );
  return { service, state, sent, redisStore, revokeAllForUser, grantCredits, verifyApple };
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function lastCode(sent: MailMessage[]): string {
  const code = /(\d{6})/.exec(sent[sent.length - 1]!.text)?.[1];
  if (code == null) throw new Error('no code in mail');
  return code;
}

describe('AuthService social sign-in linking policy', () => {
  const googleIdentity = (emailVerified: boolean): VerifiedSocialIdentity => ({
    providerUserId: 'google-sub-1',
    email: 'victim@test.local',
    emailVerified,
  });

  it('refuses to attach a social identity to a password account with the same email', async () => {
    const { service, state } = buildService(
      { users: [makeUser({ id: 'u-pass', email: 'victim@test.local', passwordHash: 'argon2$x' })] },
      googleIdentity(true),
    );

    await expect(service.loginWithGoogle({ idToken: 'token-token-token' })).rejects.toMatchObject({
      code: ErrorCode.AUTH_EMAIL_IN_USE,
      status: 409,
    });
    expect(state.identities).toHaveLength(0);
    expect(state.users).toHaveLength(1);
  });

  it('links a verified email to an existing social-only account', async () => {
    const { service, state } = buildService(
      {
        users: [makeUser({ id: 'u-apple', email: 'victim@test.local' })],
        identities: [
          { id: 'i1', userId: 'u-apple', provider: AuthProvider.APPLE, providerUserId: 'apple-1' },
        ],
      },
      googleIdentity(true),
    );

    const session = await service.loginWithGoogle({ idToken: 'token-token-token' });

    expect(session.user.id).toBe('u-apple');
    expect(state.users).toHaveLength(1);
    expect(state.identities).toContainEqual(
      expect.objectContaining({ userId: 'u-apple', provider: AuthProvider.GOOGLE }),
    );
  });

  it('never links an unverified email — a fresh account is created instead', async () => {
    const { service, state } = buildService(
      { users: [makeUser({ id: 'u-apple', email: 'victim@test.local' })] },
      googleIdentity(false),
    );

    const session = await service.loginWithGoogle({ idToken: 'token-token-token' });

    expect(session.user.id).not.toBe('u-apple');
    expect(state.users).toHaveLength(2);
    // the unverified claim must not occupy the real address either
    expect(session.user.email).toBe('google-google-sub-1@users.masalim.app');
    expect(state.identities.every((i) => i.userId !== 'u-apple')).toBe(true);
  });

  it('returns the identity owner on repeat sign-in without touching the email path', async () => {
    const { service, state } = buildService(
      {
        users: [
          makeUser({ id: 'u-google', email: 'other@test.local' }),
          makeUser({ id: 'u-pass', email: 'victim@test.local', passwordHash: 'argon2$x' }),
        ],
        identities: [
          {
            id: 'i1',
            userId: 'u-google',
            provider: AuthProvider.GOOGLE,
            providerUserId: 'google-sub-1',
          },
        ],
      },
      googleIdentity(true),
    );

    const session = await service.loginWithGoogle({ idToken: 'token-token-token' });

    expect(session.user.id).toBe('u-google');
    expect(state.identities).toHaveLength(1);
  });

  it('reactivates an identity owner whose account deletion is still pending', async () => {
    const { service, state } = buildService(
      {
        users: [makeUser({ id: 'u-google', email: 'victim@test.local', deletedAt: new Date() })],
        identities: [
          {
            id: 'i1',
            userId: 'u-google',
            provider: AuthProvider.GOOGLE,
            providerUserId: 'google-sub-1',
          },
        ],
        deletions: [{ id: 'd1', userId: 'u-google', scope: 'ACCOUNT', status: 'PENDING' }],
      },
      googleIdentity(true),
    );

    const session = await service.loginWithGoogle({ idToken: 'token-token-token' });

    expect(session.user.id).toBe('u-google');
    expect(state.users[0]!.deletedAt).toBeNull();
    expect(state.deletions[0]!.status).toBe('CANCELLED');
    expect(state.users).toHaveLength(1);
  });

  it('rejects an identity owner deleted past the grace period instead of recreating it', async () => {
    const { service, state } = buildService(
      {
        users: [makeUser({ id: 'u-google', email: 'victim@test.local', deletedAt: new Date() })],
        identities: [
          {
            id: 'i1',
            userId: 'u-google',
            provider: AuthProvider.GOOGLE,
            providerUserId: 'google-sub-1',
          },
        ],
      },
      googleIdentity(true),
    );

    await expect(service.loginWithGoogle({ idToken: 'token-token-token' })).rejects.toMatchObject({
      code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      status: 401,
    });
    expect(state.users).toHaveLength(1);
  });
});

describe('AuthService login during the deletion grace period', () => {
  const EMAIL = 'owner@test.local';
  let passwordHash: string;
  beforeAll(async () => {
    passwordHash = await argon2.hash('Correct123');
  });

  it('signs in a user whose deletion is still pending and cancels the request', async () => {
    const { service, state } = buildService({
      users: [makeUser({ id: 'u1', email: EMAIL, passwordHash, deletedAt: new Date() })],
      deletions: [{ id: 'd1', userId: 'u1', scope: 'ACCOUNT', status: 'PENDING' }],
    });

    const session = await service.login({ email: EMAIL, password: 'Correct123' }, '10.0.0.1');

    expect(session.user.id).toBe('u1');
    expect(state.users[0]!.deletedAt).toBeNull();
    expect(state.deletions[0]!.status).toBe('CANCELLED');
  });

  it('keeps rejecting a user deleted past the grace period', async () => {
    const { service, redisStore } = buildService({
      users: [makeUser({ id: 'u1', email: EMAIL, passwordHash, deletedAt: new Date() })],
    });

    await expect(
      service.login({ email: EMAIL, password: 'Correct123' }, '10.0.0.1'),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_INVALID_CREDENTIALS, status: 401 });
    expect(redisStore.get(`auth:lockout:ip:${EMAIL}:10.0.0.1`)).toBe('1');
  });

  it('clears the lockout counters of the client that finally signs in', async () => {
    const { service, redisStore } = buildService({
      users: [makeUser({ id: 'u1', email: EMAIL, passwordHash })],
    });
    await expect(
      service.login({ email: EMAIL, password: 'wrong-pass' }, '10.0.0.1'),
    ).rejects.toBeInstanceOf(AppException);
    expect(redisStore.get(`auth:lockout:email:${EMAIL}`)).toBe('1');

    await service.login({ email: EMAIL, password: 'Correct123' }, '10.0.0.1');

    expect(redisStore.size).toBe(0);
  });
});

describe('AuthService password reset guessing budget', () => {
  const EMAIL = 'owner@test.local';
  const seed = () => ({
    users: [makeUser({ id: 'u1', email: EMAIL, passwordHash: 'argon2$old' })],
  });
  const wrongAttempt = (service: AuthService, code: string) =>
    service.resetPassword({ email: EMAIL, code, newPassword: 'NewPass123' }, '10.0.0.1');

  async function issueCode(service: AuthService, sent: MailMessage[]): Promise<string> {
    await service.forgotPassword({ email: EMAIL });
    return lastCode(sent);
  }

  it('retires earlier codes whenever a new one is requested', async () => {
    const { service, state, sent } = buildService(seed());

    const first = await issueCode(service, sent);
    const second = await issueCode(service, sent);

    expect(first).not.toBe(second);
    expect(state.resets.filter((r) => r.usedAt === null)).toHaveLength(1);
    expect(state.resets.find((r) => r.codeHash === sha256(first))!.usedAt).not.toBeNull();
  });

  it('burns every outstanding code after the fifth wrong guess', async () => {
    const { service, state, sent, redisStore } = buildService(seed());
    const code = await issueCode(service, sent);

    for (let i = 0; i < MAX_RESET_CODE_ATTEMPTS - 1; i += 1) {
      await expect(wrongAttempt(service, '000000')).rejects.toMatchObject({
        code: ErrorCode.AUTH_RESET_CODE_INVALID,
      });
    }
    // still live after four misses
    expect(state.resets.find((r) => r.codeHash === sha256(code))!.usedAt).toBeNull();

    await expect(wrongAttempt(service, '000000')).rejects.toMatchObject({
      code: ErrorCode.AUTH_RESET_CODE_INVALID,
      status: 400,
    });
    expect(state.resets.find((r) => r.codeHash === sha256(code))!.usedAt).not.toBeNull();
    expect(redisStore.get('auth:reset-attempts:u1')).toBe(String(MAX_RESET_CODE_ATTEMPTS));

    // the right code is worthless now, and so is a freshly requested one
    await expect(wrongAttempt(service, code)).rejects.toBeInstanceOf(AppException);
    const fresh = await issueCode(service, sent);
    await expect(wrongAttempt(service, fresh)).rejects.toMatchObject({
      code: ErrorCode.AUTH_RESET_CODE_INVALID,
    });
    expect(state.users[0]!.passwordHash).toBe('argon2$old');
  });

  it('accepts the live code, clears the guess counter and lockout, and revokes sessions', async () => {
    const { service, state, sent, redisStore, revokeAllForUser } = buildService(seed());
    const code = await issueCode(service, sent);
    await expect(wrongAttempt(service, '000000')).rejects.toBeInstanceOf(AppException);
    redisStore.set(`auth:lockout:email:${EMAIL}`, '40');
    redisStore.set(`auth:lockout:ip:${EMAIL}:10.0.0.1`, '8');

    await service.resetPassword({ email: EMAIL, code, newPassword: 'NewPass123' }, '10.0.0.1');

    expect(state.users[0]!.passwordHash).not.toBe('argon2$old');
    expect(state.resets[0]!.usedAt).not.toBeNull();
    expect(redisStore.size).toBe(0);
    expect(revokeAllForUser).toHaveBeenCalledWith('u1');
    // a used code cannot be replayed
    await expect(wrongAttempt(service, code)).rejects.toBeInstanceOf(AppException);
  });

  it('does not reveal whether the account exists on forgot', async () => {
    const { service, sent, state } = buildService(seed());

    await expect(service.forgotPassword({ email: 'nobody@test.local' })).resolves.toBeUndefined();

    expect(sent).toHaveLength(0);
    expect(state.resets).toHaveLength(0);
  });
});

describe('AuthService e-mail verification and the signup gift', () => {
  const registerInput = {
    email: 'new@test.local',
    password: 'Correct123',
    name: 'Yeni Ebeveyn',
    locale: 'tr' as const,
  };
  const giftCall = (userId: string) => [
    userId,
    SIGNUP_GIFT_CREDITS,
    CreditReason.SIGNUP_GIFT,
    { type: 'user', id: userId },
    `gift:${userId}`,
  ];

  it('mock mail: the gift is granted at registration and no code is mailed', async () => {
    const { service, sent, grantCredits } = buildService({}, undefined, { mailProvider: 'mock' });

    const session = await service.register(registerInput);

    expect(grantCredits).toHaveBeenCalledTimes(1);
    expect(grantCredits).toHaveBeenCalledWith(...giftCall(session.user.id));
    expect(sent).toHaveLength(0);
    await expect(service.sendVerificationCode(session.user.id)).resolves.toEqual({
      sent: false,
      cooldownSeconds: 0,
    });
  });

  it('smtp: registration withholds the gift, mails a code, and the right code releases it once', async () => {
    const { service, state, sent, grantCredits } = buildService({}, undefined, {
      mailProvider: 'smtp',
    });

    const session = await service.register(registerInput);
    const userId = session.user.id;

    expect(grantCredits).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('new@test.local');
    expect(sent[0]!.subject).toContain('doğrulama');
    const code = lastCode(sent);
    expect(state.verifications).toHaveLength(1);
    expect(state.verifications[0]!.codeHash).toBe(sha256(code));

    await expect(service.verifyEmail(userId, code)).resolves.toEqual({
      verified: true,
      giftGranted: true,
    });
    expect(state.users[0]!.emailVerifiedAt).not.toBeNull();
    expect(state.verifications[0]!.usedAt).not.toBeNull();
    expect(grantCredits).toHaveBeenCalledTimes(1);
    expect(grantCredits).toHaveBeenCalledWith(...giftCall(userId));

    // already verified: a no-op, and never a second gift
    await expect(service.verifyEmail(userId, code)).resolves.toEqual({
      verified: true,
      giftGranted: false,
    });
    await expect(service.sendVerificationCode(userId)).resolves.toEqual({
      sent: false,
      cooldownSeconds: 0,
    });
    expect(grantCredits).toHaveBeenCalledTimes(1);
  });

  it('smtp: a resend inside the cooldown is refused with 429, afterwards it retires the old code', async () => {
    const { service, state, sent, redisStore } = buildService({}, undefined, {
      mailProvider: 'smtp',
    });
    const session = await service.register(registerInput);
    const userId = session.user.id;
    const first = lastCode(sent);

    await expect(service.sendVerificationCode(userId)).rejects.toMatchObject({
      code: ErrorCode.RATE_LIMITED,
      status: 429,
      details: { retryAfterSeconds: 60 },
    });
    expect(sent).toHaveLength(1);

    redisStore.delete(`auth:verify-send:${userId}`); // the cooldown lapses
    await expect(service.sendVerificationCode(userId)).resolves.toEqual({
      sent: true,
      cooldownSeconds: 60,
    });
    expect(sent).toHaveLength(2);
    const second = lastCode(sent);
    expect(second).not.toBe(first);
    expect(state.verifications.filter((v) => v.usedAt === null)).toHaveLength(1);
    await expect(service.verifyEmail(userId, first)).rejects.toMatchObject({
      code: ErrorCode.AUTH_RESET_CODE_INVALID,
      status: 400,
    });
    await expect(service.verifyEmail(userId, second)).resolves.toMatchObject({ verified: true });
  });

  it('smtp: five wrong codes burn the live code and the gift stays withheld', async () => {
    const { service, state, sent, redisStore, grantCredits } = buildService({}, undefined, {
      mailProvider: 'smtp',
    });
    const session = await service.register(registerInput);
    const userId = session.user.id;
    const code = lastCode(sent);

    for (let i = 0; i < 4; i += 1) {
      await expect(service.verifyEmail(userId, '000000')).rejects.toMatchObject({
        code: ErrorCode.AUTH_RESET_CODE_INVALID,
      });
    }
    expect(state.verifications[0]!.usedAt).toBeNull();

    await expect(service.verifyEmail(userId, '000000')).rejects.toMatchObject({
      code: ErrorCode.AUTH_RESET_CODE_INVALID,
      status: 400,
    });
    expect(state.verifications[0]!.usedAt).not.toBeNull();
    expect(redisStore.get(`auth:verify-attempts:${userId}`)).toBe('5');

    // the right code is worthless now, and so is a freshly issued one
    await expect(service.verifyEmail(userId, code)).rejects.toBeInstanceOf(AppException);
    redisStore.delete(`auth:verify-send:${userId}`);
    await service.sendVerificationCode(userId);
    await expect(service.verifyEmail(userId, lastCode(sent))).rejects.toMatchObject({
      code: ErrorCode.AUTH_RESET_CODE_INVALID,
    });
    expect(state.users[0]!.emailVerifiedAt).toBeNull();
    expect(grantCredits).not.toHaveBeenCalled();
    // the password-reset budget is untouched by verification misses
    expect(redisStore.has(`auth:reset-attempts:${userId}`)).toBe(false);
  });

  it('smtp: a provider-verified social sign-in is born verified and gifted', async () => {
    const { service, state, grantCredits, sent } = buildService(
      {},
      { providerUserId: 'google-sub-9', email: 'social@test.local', emailVerified: true },
      { mailProvider: 'smtp' },
    );

    const session = await service.loginWithGoogle({ idToken: 'token-token-token' });

    expect(state.users[0]!.emailVerifiedAt).not.toBeNull();
    expect(grantCredits).toHaveBeenCalledWith(...giftCall(session.user.id));
    expect(sent).toHaveLength(0);
  });

  it('smtp: a placeholder-address social account is gifted too — there is nothing to verify', async () => {
    const { service, state, grantCredits } = buildService(
      {},
      { providerUserId: 'google-sub-9', email: 'claimed@test.local', emailVerified: false },
      { mailProvider: 'smtp' },
    );

    const session = await service.loginWithGoogle({ idToken: 'token-token-token' });

    expect(session.user.email).toBe('google-google-sub-9@users.masalim.app');
    expect(state.users[0]!.emailVerifiedAt).toBeNull();
    expect(grantCredits).toHaveBeenCalledTimes(1);
  });

  it('a failing ledger never blocks registration or verification', async () => {
    const { service, grantCredits, sent } = buildService({}, undefined, { mailProvider: 'smtp' });
    grantCredits.mockRejectedValue(new Error('ledger down'));

    const session = await service.register(registerInput);
    await expect(service.verifyEmail(session.user.id, lastCode(sent))).resolves.toEqual({
      verified: true,
      giftGranted: false,
    });
  });
});

describe('AuthService Apple nonce', () => {
  const appleIdentity: VerifiedSocialIdentity = {
    providerUserId: 'apple-sub-1',
    email: 'apple@test.local',
    emailVerified: true,
  };

  it('rejects an unknown nonce before Apple is ever asked', async () => {
    const { service, verifyApple, state } = buildService({}, appleIdentity);

    await expect(
      service.loginWithApple({ identityToken: 'x'.repeat(20), nonce: 'y'.repeat(32) }),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_PROVIDER_TOKEN_INVALID, status: 401 });
    expect(verifyApple).not.toHaveBeenCalled();
    expect(state.users).toHaveLength(0);
  });

  it('issues a single-use nonce and hands its SHA-256 to the verifier', async () => {
    const { service, verifyApple, redisStore } = buildService({}, appleIdentity);

    const { nonce } = await service.issueAppleNonce();
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(redisStore.has(`auth:apple-nonce:${sha256(nonce)}`)).toBe(true);

    const session = await service.loginWithApple({ identityToken: 'x'.repeat(20), nonce });
    expect(session.user.email).toBe('apple@test.local');
    expect(verifyApple).toHaveBeenCalledWith('x'.repeat(20), sha256(nonce));
    expect(redisStore.has(`auth:apple-nonce:${sha256(nonce)}`)).toBe(false);

    // replaying the same nonce (and token) is refused without a second Apple call
    await expect(
      service.loginWithApple({ identityToken: 'x'.repeat(20), nonce }),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_PROVIDER_TOKEN_INVALID });
    expect(verifyApple).toHaveBeenCalledTimes(1);
  });
});
