import { createHash } from 'node:crypto';
import * as argon2 from 'argon2';
import type Redis from 'ioredis';
import { AuthProvider, ErrorCode } from '@masalim/types';
import type { User } from '@masalim/database';
import { AppException } from '../../common/errors/app.exception';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MailMessage, MailService } from '../../providers/mail.service';
import type { EntitlementService } from '../subscription/entitlement.service';
import { AuthService } from './auth.service';
import { LockoutService, MAX_RESET_CODE_ATTEMPTS } from './lockout.service';
import type { SocialVerifyService, VerifiedSocialIdentity } from './social-verify.service';
import type { TokenService } from './token.service';

type IdentityRow = { id: string; userId: string; provider: AuthProvider; providerUserId: string };
type ResetRow = {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};
type DeletionRow = { id: string; userId: string; scope: string; status: string };

function makeUser(overrides: Partial<User> & { id: string; email: string }): User {
  return {
    name: 'Test',
    passwordHash: null,
    avatarKey: null,
    locale: 'tr',
    timezone: null,
    onboardingCompleted: false,
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
    resets: [] as ResetRow[],
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
          identities?: { create: { provider: AuthProvider; providerUserId: string } };
        };
      }) => {
        if (state.users.some((u) => u.email === data.email)) {
          throw new Error('P2002 unique email');
        }
        const user = makeUser({ id: id('user'), email: data.email, name: data.name });
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
    passwordReset: {
      create: async ({ data }: { data: { userId: string; codeHash: string; expiresAt: Date } }) => {
        const row: ResetRow = { id: id('reset'), usedAt: null, createdAt: new Date(), ...data };
        state.resets.push(row);
        return row;
      },
      findFirst: async ({
        where,
      }: {
        where: { userId: string; codeHash: string; usedAt: null; expiresAt: { gt: Date } };
      }) =>
        state.resets.find(
          (r) =>
            r.userId === where.userId &&
            r.codeHash === where.codeHash &&
            r.usedAt === null &&
            r.expiresAt > where.expiresAt.gt,
        ) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { usedAt: Date } }) => {
        const row = state.resets.find((r) => r.id === where.id);
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
        for (const row of state.resets) {
          if (row.userId === where.userId && row.usedAt === null) {
            row.usedAt = data.usedAt;
            count += 1;
          }
        }
        return { count };
      },
    },
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

function buildRedis() {
  const store = new Map<string, string>();
  const redis = {
    get: async (key: string) => store.get(key) ?? null,
    incr: async (key: string) => {
      const next = parseInt(store.get(key) ?? '0', 10) + 1;
      store.set(key, String(next));
      return next;
    },
    expire: async () => 1,
    del: async (...keys: string[]) => {
      let removed = 0;
      for (const key of keys) if (store.delete(key)) removed += 1;
      return removed;
    },
  };
  return { redis: redis as unknown as Redis, store };
}

function buildService(
  seed: { users?: User[]; identities?: IdentityRow[]; deletions?: DeletionRow[] },
  identity?: VerifiedSocialIdentity,
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
  const social = {
    verifyGoogle: async () => identity,
    verifyApple: async () => identity,
  } as unknown as SocialVerifyService;
  const mail = {
    send: async (message: MailMessage) => void sent.push(message),
  } as unknown as MailService;
  const entitlements = { grantCredits: async () => undefined } as unknown as EntitlementService;

  const service = new AuthService(
    prisma,
    tokens,
    social,
    new LockoutService(redis),
    mail,
    entitlements,
  );
  return { service, state, sent, redisStore, revokeAllForUser };
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

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
    const code = /(\d{6})/.exec(sent[sent.length - 1]!.text)?.[1];
    if (code == null) throw new Error('no code in mail');
    return code;
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
