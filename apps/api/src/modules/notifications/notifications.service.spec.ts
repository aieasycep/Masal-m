import type Redis from 'ioredis';
import { NotificationType, PUSH_DEVICES_PER_USER_MAX } from '@masalim/types';
import type { PushProvider, PushSendReport } from '@masalim/notifications';
import type { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService, PUSH_TICKETS_KEY } from './notifications.service';

type DeviceRow = {
  id: string;
  userId: string;
  expoPushToken: string;
  platform: string;
  lastSeenAt: Date;
};

function buildService(report: Partial<PushSendReport> = {}) {
  const devices: DeviceRow[] = [];
  let tick = 0;
  let nextId = 1;
  const prisma = {
    user: {
      findUnique: jest.fn(async () => ({ locale: 'tr', deletedAt: null, notificationPrefs: {} })),
    },
    notification: { create: jest.fn(async () => undefined) },
    deviceToken: {
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { expoPushToken: string };
          create: { userId: string; expoPushToken: string; platform: string };
          update: { userId: string; platform: string };
        }) => {
          const existing = devices.find((d) => d.expoPushToken === where.expoPushToken);
          if (existing) {
            Object.assign(existing, update, { lastSeenAt: new Date(++tick) });
            return existing;
          }
          const row = { id: `d${nextId++}`, lastSeenAt: new Date(++tick), ...create };
          devices.push(row);
          return row;
        },
      ),
      findMany: jest.fn(
        async ({
          where,
          orderBy,
          skip = 0,
        }: {
          where: { userId: string };
          orderBy?: { lastSeenAt: 'desc' };
          skip?: number;
        }) => {
          const rows = devices.filter((d) => d.userId === where.userId);
          if (orderBy?.lastSeenAt === 'desc') {
            rows.sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
          }
          return rows.slice(skip);
        },
      ),
      deleteMany: jest.fn(
        async ({
          where,
        }: {
          where: { id?: { in: string[] }; expoPushToken?: { in: string[] } };
        }) => {
          const ids = new Set(where.id?.in ?? []);
          const tokens = new Set(where.expoPushToken?.in ?? []);
          let count = 0;
          for (let i = devices.length - 1; i >= 0; i -= 1) {
            const row = devices[i]!;
            if (ids.has(row.id) || tokens.has(row.expoPushToken)) {
              devices.splice(i, 1);
              count += 1;
            }
          }
          return { count };
        },
      ),
    },
  };
  const push = {
    name: 'fake',
    send: jest.fn(async () => ({ sent: 0, deadTokens: [], tickets: [], ...report })),
  };
  const redis = { rpush: jest.fn(async () => 1) };
  const service = new NotificationsService(
    prisma as unknown as PrismaService,
    push as unknown as PushProvider,
    redis as unknown as Redis,
  );
  return { service, prisma, push, redis, devices };
}

const token = (n: number) => `ExponentPushToken[device-${n}]`;

describe('NotificationsService.registerDevice', () => {
  it('keeps at most PUSH_DEVICES_PER_USER_MAX tokens per account, dropping the least recently seen', async () => {
    const { service, devices } = buildService();

    for (let i = 1; i <= PUSH_DEVICES_PER_USER_MAX + 2; i += 1) {
      await service.registerDevice('u1', { expoPushToken: token(i), platform: 'ANDROID' });
    }

    expect(devices).toHaveLength(PUSH_DEVICES_PER_USER_MAX);
    const kept = devices.map((d) => d.expoPushToken);
    expect(kept).not.toContain(token(1));
    expect(kept).not.toContain(token(2));
    expect(kept).toContain(token(PUSH_DEVICES_PER_USER_MAX + 2));
  });

  it('re-registering an existing token refreshes it instead of evicting it', async () => {
    const { service, devices } = buildService();
    for (let i = 1; i <= PUSH_DEVICES_PER_USER_MAX; i += 1) {
      await service.registerDevice('u1', { expoPushToken: token(i), platform: 'IOS' });
    }

    await service.registerDevice('u1', { expoPushToken: token(1), platform: 'IOS' });
    await service.registerDevice('u1', { expoPushToken: token(99), platform: 'IOS' });

    const kept = devices.map((d) => d.expoPushToken);
    expect(kept).toContain(token(1)); // just seen
    expect(kept).not.toContain(token(2)); // now the oldest
    expect(devices).toHaveLength(PUSH_DEVICES_PER_USER_MAX);
  });

  it('counts the cap per account, not across accounts', async () => {
    const { service, devices } = buildService();
    for (let i = 1; i <= PUSH_DEVICES_PER_USER_MAX; i += 1) {
      await service.registerDevice('u1', { expoPushToken: token(i), platform: 'IOS' });
    }

    await service.registerDevice('u2', { expoPushToken: token(50), platform: 'IOS' });

    expect(devices).toHaveLength(PUSH_DEVICES_PER_USER_MAX + 1);
  });
});

describe('NotificationsService.notify', () => {
  it('queues accepted tickets for the receipt sweep and prunes tokens reported dead', async () => {
    const { service, prisma, redis, devices } = buildService({
      sent: 1,
      deadTokens: [token(2)],
      tickets: [{ id: 'ticket-1', token: token(1) }],
    });
    devices.push(
      { id: 'd1', userId: 'u1', expoPushToken: token(1), platform: 'IOS', lastSeenAt: new Date() },
      { id: 'd2', userId: 'u1', expoPushToken: token(2), platform: 'IOS', lastSeenAt: new Date() },
    );
    const before = Date.now();

    await service.notify('u1', NotificationType.STORY_READY, { storyTitle: 'Ay' }, '/story/s1');

    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { expoPushToken: { in: [token(2)] } },
    });
    expect(redis.rpush).toHaveBeenCalledTimes(1);
    const [key, entry] = redis.rpush.mock.calls[0] as unknown as [string, string];
    expect(key).toBe(PUSH_TICKETS_KEY);
    const parsed = JSON.parse(entry) as { ticketId: string; token: string; at: number };
    expect(parsed).toMatchObject({ ticketId: 'ticket-1', token: token(1) });
    expect(parsed.at).toBeGreaterThanOrEqual(before);
  });

  it('writes nothing to the ticket queue when nothing was accepted', async () => {
    const { service, redis, devices } = buildService({ sent: 0, deadTokens: [], tickets: [] });
    devices.push({
      id: 'd1',
      userId: 'u1',
      expoPushToken: token(1),
      platform: 'IOS',
      lastSeenAt: new Date(),
    });

    await service.notify('u1', NotificationType.STORY_READY, {}, '/story/s1');

    expect(redis.rpush).not.toHaveBeenCalled();
  });

  it('never fails the caller on a push error — the in-app row is already written', async () => {
    const { service, push, prisma, devices } = buildService();
    push.send.mockRejectedValueOnce(new Error('expo down'));
    devices.push({
      id: 'd1',
      userId: 'u1',
      expoPushToken: token(1),
      platform: 'IOS',
      lastSeenAt: new Date(),
    });

    await expect(
      service.notify('u1', NotificationType.STORY_READY, {}, '/story/s1'),
    ).resolves.toBeUndefined();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });
});
