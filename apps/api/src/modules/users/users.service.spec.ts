import { ErrorCode } from '@masalim/types';
import type { StorageProvider } from '@masalim/storage';
import { AppException } from '../../common/errors/app.exception';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TokenService } from '../auth/token.service';
import { assertOwnAvatarKey, UsersService } from './users.service';

function buildService() {
  const user = {
    id: 'u1',
    email: 'u1@test.local',
    name: 'Ayşe',
    avatarKey: null as string | null,
    locale: 'tr',
    timezone: 'Europe/Istanbul',
    onboardingCompleted: true,
    subscriptionPlan: 'FREE',
    notificationPrefs: {},
    createdAt: new Date('2024-01-01T00:00:00Z'),
    deletionRequests: [],
  };
  const prisma = {
    user: {
      findUnique: jest.fn(async () => user),
      update: jest.fn(async ({ data }: { data: { avatarKey?: string | null } }) => {
        if (data.avatarKey !== undefined) user.avatarKey = data.avatarKey;
        return user;
      }),
    },
  } as unknown as PrismaService;
  const storage = {
    getSignedUrl: jest.fn(async (key: string) => `signed:${key}`),
  } as unknown as StorageProvider;
  const service = new UsersService(prisma, {} as TokenService, storage);
  return { service, prisma, user };
}

describe('UsersService.updateMe avatar guard', () => {
  it('accepts a key under the caller’s own avatar prefix and signs it', async () => {
    const { service, user } = buildService();

    const me = await service.updateMe('u1', { avatarObjectKey: 'users/u1/avatars/abc.jpg' });

    expect(user.avatarKey).toBe('users/u1/avatars/abc.jpg');
    expect(me.avatarUrl).toBe('signed:users/u1/avatars/abc.jpg');
  });

  it('rejects another account’s object key without touching the row', async () => {
    const { service, prisma } = buildService();

    await expect(
      service.updateMe('u1', { avatarObjectKey: 'users/u2/avatars/private.jpg' }),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN_OWNERSHIP });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects traversal inside an otherwise well-prefixed key', async () => {
    const { service, prisma } = buildService();

    await expect(
      service.updateMe('u1', { avatarObjectKey: 'users/u1/avatars/../../u2/avatars/x.jpg' }),
    ).rejects.toBeInstanceOf(AppException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('still allows clearing the avatar with null', async () => {
    const { service, user } = buildService();
    user.avatarKey = 'users/u1/avatars/old.jpg';

    await service.updateMe('u1', { avatarObjectKey: null });

    expect(user.avatarKey).toBeNull();
  });
});

describe('assertOwnAvatarKey', () => {
  it('requires the exact prefix with a trailing separator', () => {
    expect(() => assertOwnAvatarKey('u1', 'users/u1/avatars/a.png')).not.toThrow();
    expect(() => assertOwnAvatarKey('u1', 'users/u10/avatars/a.png')).toThrow(AppException);
    expect(() => assertOwnAvatarKey('u1', 'users/u1/avatarsx/a.png')).toThrow(AppException);
    expect(() => assertOwnAvatarKey('u1', 'orders/o1/cover.png')).toThrow(AppException);
  });
});
