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
    emailVerifiedAt: null as Date | null,
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
    // Only keys named "missing" have no object behind them.
    exists: jest.fn(async (key: string) => !key.includes('missing')),
    deleteObject: jest.fn(async () => undefined),
  };
  const service = new UsersService(
    prisma,
    {} as TokenService,
    storage as unknown as StorageProvider,
  );
  return { service, prisma, storage, user };
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

  it('rejects an own-prefixed key with no uploaded object behind it', async () => {
    const { service, prisma, storage } = buildService();

    await expect(
      service.updateMe('u1', { avatarObjectKey: 'users/u1/avatars/missing.jpg' }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED, status: 400 });
    expect(storage.exists).toHaveBeenCalledWith('users/u1/avatars/missing.jpg');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('still allows clearing the avatar with null', async () => {
    const { service, user } = buildService();
    user.avatarKey = 'users/u1/avatars/old.jpg';

    await service.updateMe('u1', { avatarObjectKey: null });

    expect(user.avatarKey).toBeNull();
  });
});

describe('UsersService.updateMe previous avatar cleanup', () => {
  it('deletes the replaced object and, later, the cleared one', async () => {
    const { service, storage, user } = buildService();
    user.avatarKey = 'users/u1/avatars/old.jpg';

    await service.updateMe('u1', { avatarObjectKey: 'users/u1/avatars/new.jpg' });
    expect(storage.deleteObject).toHaveBeenCalledWith('users/u1/avatars/old.jpg');

    await service.updateMe('u1', { avatarObjectKey: null });
    expect(storage.deleteObject).toHaveBeenCalledWith('users/u1/avatars/new.jpg');
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
  });

  it('keeps the object when the same key is sent again or the avatar is not touched', async () => {
    const { service, storage, user } = buildService();
    user.avatarKey = 'users/u1/avatars/same.jpg';

    await service.updateMe('u1', { avatarObjectKey: 'users/u1/avatars/same.jpg' });
    await service.updateMe('u1', { name: 'Ayşe Yılmaz' });

    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(storage.exists).toHaveBeenCalledTimes(1);
  });

  it('survives a failed delete of the old object', async () => {
    const { service, storage, user } = buildService();
    user.avatarKey = 'users/u1/avatars/old.jpg';
    storage.deleteObject.mockRejectedValueOnce(new Error('s3 down'));

    await expect(
      service.updateMe('u1', { avatarObjectKey: 'users/u1/avatars/new.jpg' }),
    ).resolves.toMatchObject({ avatarUrl: 'signed:users/u1/avatars/new.jpg' });
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
