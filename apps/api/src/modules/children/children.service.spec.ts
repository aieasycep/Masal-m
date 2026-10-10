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
      findFirst: jest.fn(async () => child),
      update: jest.fn(async ({ data }: { data: { avatarKey?: string | null } }) => {
        if (data.avatarKey !== undefined) child.avatarKey = data.avatarKey;
        return child;
      }),
    },
    story: { count: jest.fn(async () => 0) },
  } as unknown as PrismaService;
  const storage = {
    getSignedUrl: jest.fn(async (key: string) => `signed:${key}`),
  } as unknown as StorageProvider;
  const service = new ChildrenService(prisma, storage);
  return { service, prisma, child };
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

  it('update accepts an own key and allows clearing with null', async () => {
    const { service, child } = buildService();

    await service.update('u1', 'c1', { avatarObjectKey: 'users/u1/avatars/new.jpg' });
    expect(child.avatarKey).toBe('users/u1/avatars/new.jpg');

    await service.update('u1', 'c1', { avatarObjectKey: null });
    expect(child.avatarKey).toBeNull();
  });
});
