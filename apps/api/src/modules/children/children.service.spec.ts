import { AgeRange, ErrorCode } from '@masalim/types';
import type { StorageProvider } from '@masalim/storage';
import type { PrismaService } from '../../prisma/prisma.service';
import { ChildrenService } from './children.service';

function buildService() {
  const child = {
    id: 'c1',
    userId: 'u1',
    name: 'Ege',
    birthDate: null as Date | null,
    ageRange: AgeRange.AGE_3_5,
    avatarKey: null as string | null,
    interests: [] as string[],
    preferences: {},
    deletedAt: null as Date | null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
  };
  const prisma = {
    child: {
      create: jest.fn(async ({ data }: { data: { avatarKey?: string | null } }) => ({
        ...child,
        id: 'c2',
        avatarKey: data.avatarKey ?? null,
      })),
      // findOwned reads the row BEFORE the update: hand back a snapshot so the
      // service sees the previous avatar key, like a real database would.
      findFirst: jest.fn(async () => ({ ...child })),
      update: jest.fn(async ({ data }: { data: { avatarKey?: string | null } }) => {
        if (data.avatarKey !== undefined) child.avatarKey = data.avatarKey;
        return child;
      }),
    },
    story: { count: jest.fn(async () => 0) },
  } as unknown as PrismaService;
  const storage = {
    getSignedUrl: jest.fn(async (key: string) => `signed:${key}`),
    // Only keys named "missing" have no object behind them.
    exists: jest.fn(async (key: string) => !key.includes('missing')),
    deleteObject: jest.fn(async () => undefined),
  };
  const service = new ChildrenService(prisma, storage as unknown as StorageProvider);
  return { service, prisma, storage, child };
}

const baseCreate = { name: 'Ada', interests: [], preferences: {} };

describe('ChildrenService avatar guard', () => {
  it('create accepts a key under the parent’s own avatar prefix', async () => {
    const { service } = buildService();

    const created = await service.create('u1', {
      ...baseCreate,
      avatarObjectKey: 'users/u1/avatars/ada.jpg',
    });

    expect(created.avatarUrl).toBe('signed:users/u1/avatars/ada.jpg');
  });

  it('create rejects a key from another account', async () => {
    const { service, prisma } = buildService();

    await expect(
      service.create('u1', { ...baseCreate, avatarObjectKey: 'users/u2/avatars/ada.jpg' }),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN_OWNERSHIP });
    expect(prisma.child.create).not.toHaveBeenCalled();
  });

  it('create rejects an own key with nothing uploaded behind it', async () => {
    const { service, prisma, storage } = buildService();

    await expect(
      service.create('u1', { ...baseCreate, avatarObjectKey: 'users/u1/avatars/missing.jpg' }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED, status: 400 });
    expect(storage.exists).toHaveBeenCalledWith('users/u1/avatars/missing.jpg');
    expect(prisma.child.create).not.toHaveBeenCalled();
  });

  it('update rejects a foreign or traversing key even for an owned child', async () => {
    const { service, prisma, child } = buildService();

    await expect(
      service.update('u1', 'c1', { avatarObjectKey: 'users/u2/avatars/ada.jpg' }),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN_OWNERSHIP });
    await expect(
      service.update('u1', 'c1', { avatarObjectKey: 'users/u1/avatars/../secret.jpg' }),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN_OWNERSHIP });
    expect(prisma.child.update).not.toHaveBeenCalled();
    expect(child.avatarKey).toBeNull();
  });

  it('update rejects a dangling key and keeps the current avatar', async () => {
    const { service, prisma, child } = buildService();
    child.avatarKey = 'users/u1/avatars/current.jpg';

    await expect(
      service.update('u1', 'c1', { avatarObjectKey: 'users/u1/avatars/missing.jpg' }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    expect(prisma.child.update).not.toHaveBeenCalled();
    expect(child.avatarKey).toBe('users/u1/avatars/current.jpg');
  });

  it('update accepts an own key and allows clearing with null', async () => {
    const { service, child } = buildService();

    await service.update('u1', 'c1', { avatarObjectKey: 'users/u1/avatars/new.jpg' });
    expect(child.avatarKey).toBe('users/u1/avatars/new.jpg');

    await service.update('u1', 'c1', { avatarObjectKey: null });
    expect(child.avatarKey).toBeNull();
  });
});

describe('ChildrenService previous avatar cleanup', () => {
  it('deletes the replaced object, then the cleared one', async () => {
    const { service, storage, child } = buildService();
    child.avatarKey = 'users/u1/avatars/old.jpg';

    await service.update('u1', 'c1', { avatarObjectKey: 'users/u1/avatars/new.jpg' });
    expect(storage.deleteObject).toHaveBeenCalledWith('users/u1/avatars/old.jpg');

    await service.update('u1', 'c1', { avatarObjectKey: null });
    expect(storage.deleteObject).toHaveBeenCalledWith('users/u1/avatars/new.jpg');
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
  });

  it('keeps the object when the key is unchanged or the avatar is not part of the update', async () => {
    const { service, storage, child } = buildService();
    child.avatarKey = 'users/u1/avatars/same.jpg';

    await service.update('u1', 'c1', { avatarObjectKey: 'users/u1/avatars/same.jpg' });
    await service.update('u1', 'c1', { name: 'Ege Can' });

    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});
