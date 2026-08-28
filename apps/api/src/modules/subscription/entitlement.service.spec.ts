import { EntitlementKey, ErrorCode, SubscriptionPlan, SubscriptionStatus } from '@masalim/types';
import { EntitlementService } from './entitlement.service';
import { AppException } from '../../common/errors/app.exception';
import type { PrismaService } from '../../prisma/prisma.service';

interface UsageRow {
  userId: string;
  key: string;
  periodStart: Date;
  count: number;
}

function buildPrisma(options: {
  subscription?: {
    status: SubscriptionStatus;
    plan: SubscriptionPlan;
    expiresAt: Date | null;
  } | null;
}) {
  const usage: UsageRow[] = [];
  const prisma = {
    subscription: {
      findUnique: jest.fn(async () =>
        options.subscription == null ? null : { userId: 'u1', ...options.subscription },
      ),
    },
    entitlementUsage: {
      findMany: jest.fn(async () => usage),
      upsert: jest.fn(
        async ({ where, create }: { where: { userId_key_periodStart: Omit<UsageRow, 'count'> }; create: UsageRow }) => {
          const key = where.userId_key_periodStart;
          let row = usage.find(
            (item) =>
              item.userId === key.userId &&
              item.key === key.key &&
              item.periodStart.getTime() === key.periodStart.getTime(),
          );
          if (row == null) {
            row = { ...create };
            usage.push(row);
          }
          return row;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { userId: string; key: string; count?: { lt?: number; gt?: number } };
          data: { count: { increment?: number; decrement?: number } };
        }) => {
          let count = 0;
          for (const row of usage) {
            if (row.userId !== where.userId || row.key !== where.key) continue;
            if (where.count?.lt != null && !(row.count < where.count.lt)) continue;
            if (where.count?.gt != null && !(row.count > where.count.gt)) continue;
            row.count += data.count.increment ?? -(data.count.decrement ?? 0);
            count += 1;
          }
          return { count };
        },
      ),
    },
  };
  return { prisma: prisma as unknown as PrismaService, usage };
}

describe('EntitlementService (§37)', () => {
  it('resolves FREE when there is no subscription', async () => {
    const { prisma } = buildPrisma({ subscription: null });
    const service = new EntitlementService(prisma);
    const resolved = await service.resolve('u1');
    expect(resolved.plan).toBe(SubscriptionPlan.FREE);
    expect(resolved.features.parent_voice_clone).toBe(false);
    expect(resolved.quotas.story_monthly_limit.limit).toBe(5);
  });

  it('resolves PREMIUM for an active unexpired subscription', async () => {
    const { prisma } = buildPrisma({
      subscription: {
        status: SubscriptionStatus.ACTIVE,
        plan: SubscriptionPlan.PREMIUM,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const service = new EntitlementService(prisma);
    const resolved = await service.resolve('u1');
    expect(resolved.plan).toBe(SubscriptionPlan.PREMIUM);
    expect(resolved.features.parent_voice_clone).toBe(true);
    expect(resolved.quotas.story_monthly_limit.limit).toBe(60);
  });

  it('keeps PREMIUM after cancellation until the paid period ends', async () => {
    const { prisma } = buildPrisma({
      subscription: {
        status: SubscriptionStatus.CANCELLED,
        plan: SubscriptionPlan.PREMIUM,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    expect(await new EntitlementService(prisma).planFor('u1')).toBe(SubscriptionPlan.PREMIUM);
  });

  it('drops to FREE once the subscription expires', async () => {
    const { prisma } = buildPrisma({
      subscription: {
        status: SubscriptionStatus.ACTIVE,
        plan: SubscriptionPlan.PREMIUM,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    expect(await new EntitlementService(prisma).planFor('u1')).toBe(SubscriptionPlan.FREE);
  });

  it('consumes quota up to the plan limit, then throws QUOTA_EXCEEDED', async () => {
    const { prisma, usage } = buildPrisma({ subscription: null }); // FREE → 5 stories
    const service = new EntitlementService(prisma);
    for (let i = 0; i < 5; i++) {
      await service.consumeQuota('u1', EntitlementKey.STORY_MONTHLY_LIMIT);
    }
    expect(usage[0]?.count).toBe(5);
    await expect(
      service.consumeQuota('u1', EntitlementKey.STORY_MONTHLY_LIMIT),
    ).rejects.toMatchObject({ code: ErrorCode.QUOTA_EXCEEDED });
    expect(usage[0]?.count).toBe(5);
  });

  it('refunds a consumed unit but never below zero', async () => {
    const { prisma, usage } = buildPrisma({ subscription: null });
    const service = new EntitlementService(prisma);
    await service.consumeQuota('u1', EntitlementKey.STORY_MONTHLY_LIMIT);
    await service.refundQuota('u1', EntitlementKey.STORY_MONTHLY_LIMIT);
    expect(usage[0]?.count).toBe(0);
    await service.refundQuota('u1', EntitlementKey.STORY_MONTHLY_LIMIT);
    expect(usage[0]?.count).toBe(0);
  });

  it('QUOTA_EXCEEDED carries the AppException error contract', async () => {
    const { prisma } = buildPrisma({ subscription: null });
    const service = new EntitlementService(prisma);
    for (let i = 0; i < 5; i++) {
      await service.consumeQuota('u1', EntitlementKey.STORY_MONTHLY_LIMIT);
    }
    const error = await service
      .consumeQuota('u1', EntitlementKey.STORY_MONTHLY_LIMIT)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
  });
});
