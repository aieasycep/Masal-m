import { CreditReason, ErrorCode, SubscriptionPlan, SubscriptionStatus } from '@masalim/types';
import { Prisma } from '@masalim/database';
import { EntitlementService } from './entitlement.service';
import { AppException } from '../../common/errors/app.exception';
import type { PrismaService } from '../../prisma/prisma.service';

interface UsageRow {
  userId: string;
  key: string;
  periodStart: Date;
  count: number;
}

interface LedgerRow {
  id: string;
  userId: string;
  delta: number;
  quotaPart: number;
  reason: CreditReason;
  refType: string | null;
  refId: string | null;
  balanceAfter: number;
  idempotencyKey: string | null;
  createdAt: Date;
}

/**
 * In-memory Prisma fake with transactional rollback: $transaction snapshots
 * state and restores it when the callback throws — mirroring the atomicity
 * the credit engine relies on.
 */
function buildPrisma(options: {
  subscription?: {
    status: SubscriptionStatus;
    plan: SubscriptionPlan;
    expiresAt: Date | null;
  } | null;
  balance?: number;
}) {
  const state = {
    usage: [] as UsageRow[],
    ledger: [] as LedgerRow[],
    balance: options.balance ?? 0,
  };
  let nextId = 1;
  let nextCreatedAt = 1_000;

  const matchUsage = (key: { userId: string; key: string; periodStart: Date }) =>
    state.usage.find(
      (row) =>
        row.userId === key.userId &&
        row.key === key.key &&
        row.periodStart.getTime() === key.periodStart.getTime(),
    );

  const client = {
    subscription: {
      findUnique: async () =>
        options.subscription == null ? null : { userId: 'u1', ...options.subscription },
    },
    user: {
      findUnique: async () => ({ creditBalance: state.balance }),
      update: async ({ data }: { data: { creditBalance?: { increment?: number } } }) => {
        state.balance += data.creditBalance?.increment ?? 0;
        return { creditBalance: state.balance };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { creditBalance?: { gte?: number } };
        data: { creditBalance?: { decrement?: number } };
      }) => {
        if (where.creditBalance?.gte != null && state.balance < where.creditBalance.gte) {
          return { count: 0 };
        }
        state.balance -= data.creditBalance?.decrement ?? 0;
        return { count: 1 };
      },
    },
    entitlementUsage: {
      upsert: async ({
        where,
        create,
      }: {
        where: { userId_key_periodStart: Omit<UsageRow, 'count'> };
        create: UsageRow;
      }) => {
        let row = matchUsage(where.userId_key_periodStart);
        if (row == null) {
          row = { ...create };
          state.usage.push(row);
        }
        return row;
      },
      findUnique: async ({
        where,
      }: {
        where: { userId_key_periodStart: Omit<UsageRow, 'count'> };
      }) => matchUsage(where.userId_key_periodStart) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId: string; key: string; count?: number };
        data: { count: { increment: number } };
      }) => {
        let count = 0;
        for (const row of state.usage) {
          if (row.userId !== where.userId || row.key !== where.key) continue;
          if (typeof where.count === 'number' && row.count !== where.count) continue;
          row.count += data.count.increment;
          count += 1;
        }
        return { count };
      },
      update: async ({
        where,
        data,
      }: {
        where: { userId_key_periodStart: Omit<UsageRow, 'count'> };
        data: { count: number };
      }) => {
        const row = matchUsage(where.userId_key_periodStart);
        if (row != null) row.count = data.count;
        return row;
      },
    },
    creditLedger: {
      create: async ({
        data,
      }: {
        data: Omit<LedgerRow, 'id' | 'createdAt' | 'refType' | 'refId' | 'idempotencyKey'> &
          Partial<Pick<LedgerRow, 'refType' | 'refId' | 'idempotencyKey'>>;
      }) => {
        if (
          data.idempotencyKey != null &&
          state.ledger.some((row) => row.idempotencyKey === data.idempotencyKey)
        ) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const row: LedgerRow = {
          refType: null,
          refId: null,
          idempotencyKey: null,
          ...data,
          id: `l${nextId++}`,
          createdAt: new Date(nextCreatedAt++),
        };
        state.ledger.push(row);
        return row;
      },
      findFirst: async ({
        where,
      }: {
        where: { refType?: string; refId?: string; reason?: { in: CreditReason[] } };
      }) => {
        const rows = state.ledger
          .filter(
            (row) =>
              (where.refType == null || row.refType === where.refType) &&
              (where.refId == null || row.refId === where.refId) &&
              (where.reason == null || where.reason.in.includes(row.reason)),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows[0] ?? null;
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapshot = {
        usage: state.usage.map((row) => ({ ...row })),
        ledger: state.ledger.map((row) => ({ ...row })),
        balance: state.balance,
      };
      try {
        return await fn(client);
      } catch (error) {
        state.usage.splice(0, state.usage.length, ...snapshot.usage);
        state.ledger.splice(0, state.ledger.length, ...snapshot.ledger);
        state.balance = snapshot.balance;
        throw error;
      }
    },
  };

  return { prisma: client as unknown as PrismaService, state };
}

const STORY_REF = { type: 'story', id: 's1' };

describe('EntitlementService — credit engine (§37)', () => {
  it('resolves FREE: 3-credit monthly quota, no premium features, balance surfaced', async () => {
    const { prisma } = buildPrisma({ subscription: null, balance: 6 });
    const resolved = await new EntitlementService(prisma).resolve('u1');
    expect(resolved.plan).toBe(SubscriptionPlan.FREE);
    expect(resolved.features.parent_voice_clone).toBe(false);
    expect(resolved.credits.quota.limit).toBe(3);
    expect(resolved.credits.balance).toBe(6);
  });

  it('resolves PREMIUM: 30-credit quota + features', async () => {
    const { prisma } = buildPrisma({
      subscription: {
        status: SubscriptionStatus.ACTIVE,
        plan: SubscriptionPlan.PREMIUM,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const resolved = await new EntitlementService(prisma).resolve('u1');
    expect(resolved.plan).toBe(SubscriptionPlan.PREMIUM);
    expect(resolved.features.parent_voice_clone).toBe(true);
    expect(resolved.credits.quota.limit).toBe(30);
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

  it('spends quota first, then balance — ledger records the split', async () => {
    const { prisma, state } = buildPrisma({ subscription: null, balance: 6 }); // FREE → quota 3
    const service = new EntitlementService(prisma);
    await service.consumeCredits('u1', 6, CreditReason.STORY_SPEND, STORY_REF);
    expect(state.usage[0]?.count).toBe(3); // full quota drawn
    expect(state.balance).toBe(3); // remainder from balance
    expect(state.ledger).toHaveLength(1);
    expect(state.ledger[0]).toMatchObject({ delta: -3, quotaPart: 3, refId: 's1' });
  });

  it('spends balance only once the quota is exhausted', async () => {
    const { prisma, state } = buildPrisma({ subscription: null, balance: 10 });
    const service = new EntitlementService(prisma);
    await service.consumeCredits('u1', 3, CreditReason.STORY_SPEND, STORY_REF);
    await service.consumeCredits('u1', 3, CreditReason.STORY_SPEND, { type: 'story', id: 's2' });
    expect(state.usage[0]?.count).toBe(3);
    expect(state.balance).toBe(7);
  });

  it('INSUFFICIENT_CREDITS leaves quota, balance and ledger untouched', async () => {
    const { prisma, state } = buildPrisma({ subscription: null, balance: 2 }); // 3 + 2 < 6
    const service = new EntitlementService(prisma);
    const error = await service
      .consumeCredits('u1', 6, CreditReason.STORY_SPEND, STORY_REF)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect(error).toMatchObject({ code: ErrorCode.INSUFFICIENT_CREDITS });
    expect(state.usage[0]?.count ?? 0).toBe(0);
    expect(state.balance).toBe(2);
    expect(state.ledger).toHaveLength(0);
  });

  it('refundCreditsForRef reverses the exact split and is idempotent', async () => {
    const { prisma, state } = buildPrisma({ subscription: null, balance: 6 });
    const service = new EntitlementService(prisma);
    await service.consumeCredits('u1', 6, CreditReason.STORY_SPEND, STORY_REF);
    await service.refundCreditsForRef('u1', 'story', 's1');
    expect(state.usage[0]?.count).toBe(0);
    expect(state.balance).toBe(6);
    // Double refund must be a no-op (unique refund key).
    await service.refundCreditsForRef('u1', 'story', 's1');
    expect(state.balance).toBe(6);
    expect(state.ledger.filter((row) => row.reason === CreditReason.REFUND)).toHaveLength(1);
  });

  it('refund for a reference without a spend row is a no-op', async () => {
    const { prisma, state } = buildPrisma({ subscription: null, balance: 1 });
    await new EntitlementService(prisma).refundCreditsForRef('u1', 'story', 'ghost');
    expect(state.balance).toBe(1);
    expect(state.ledger).toHaveLength(0);
  });

  it('grantCredits is idempotent on the idempotency key', async () => {
    const { prisma, state } = buildPrisma({ subscription: null });
    const service = new EntitlementService(prisma);
    const first = await service.grantCredits(
      'u1',
      12,
      CreditReason.PURCHASE,
      { type: 'product', id: 'masalim_credits_12_std' },
      'rc:evt-1',
    );
    const replay = await service.grantCredits(
      'u1',
      12,
      CreditReason.PURCHASE,
      { type: 'product', id: 'masalim_credits_12_std' },
      'rc:evt-1',
    );
    expect(first).toBe(true);
    expect(replay).toBe(false);
    expect(state.balance).toBe(12);
    expect(state.ledger).toHaveLength(1);
  });
});
