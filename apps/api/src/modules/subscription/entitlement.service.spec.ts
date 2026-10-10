import { CreditReason, ErrorCode, SubscriptionPlan, SubscriptionStatus } from '@masalim/types';
import { Prisma } from '@masalim/database';
import { EntitlementService, latestMonthlyAnchorAtOrBefore } from './entitlement.service';
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
    startedAt?: Date;
    currentPeriodStartedAt?: Date | null;
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
        options.subscription == null
          ? null
          : {
              userId: 'u1',
              startedAt: new Date(0),
              currentPeriodStartedAt: null,
              ...options.subscription,
            },
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

describe('latestMonthlyAnchorAtOrBefore (D.1)', () => {
  const anchor = new Date('2026-03-15T09:30:00.000Z');

  it('returns the anchor itself inside the first period', () => {
    expect(latestMonthlyAnchorAtOrBefore(new Date('2026-03-20T00:00:00Z'), anchor)).toEqual(anchor);
  });

  it('steps whole months forward keeping the day-of-month and time', () => {
    expect(latestMonthlyAnchorAtOrBefore(new Date('2026-05-20T00:00:00Z'), anchor)).toEqual(
      new Date('2026-05-15T09:30:00.000Z'),
    );
    expect(latestMonthlyAnchorAtOrBefore(new Date('2027-01-02T00:00:00Z'), anchor)).toEqual(
      new Date('2026-12-15T09:30:00.000Z'),
    );
  });

  it('does not step past now on the renewal day itself', () => {
    expect(latestMonthlyAnchorAtOrBefore(new Date('2026-04-15T09:00:00Z'), anchor)).toEqual(anchor);
    expect(latestMonthlyAnchorAtOrBefore(new Date('2026-04-15T09:30:00Z'), anchor)).toEqual(
      new Date('2026-04-15T09:30:00.000Z'),
    );
  });

  it('clamps the day to the target month without losing the original day later', () => {
    const jan31 = new Date('2026-01-31T00:00:00.000Z');
    expect(latestMonthlyAnchorAtOrBefore(new Date('2026-03-01T00:00:00Z'), jan31)).toEqual(
      new Date('2026-02-28T00:00:00.000Z'),
    );
    expect(latestMonthlyAnchorAtOrBefore(new Date('2026-03-31T01:00:00Z'), jan31)).toEqual(
      new Date('2026-03-31T00:00:00.000Z'),
    );
  });

  it('returns a future anchor unchanged', () => {
    const future = new Date('2026-03-16T00:00:00Z');
    expect(latestMonthlyAnchorAtOrBefore(new Date('2026-03-15T00:00:00Z'), future)).toEqual(future);
  });
});

describe('EntitlementService — quota period follows the billing period (D.1)', () => {
  const premiumAnchoredAt = (anchor: Date) => ({
    status: SubscriptionStatus.ACTIVE,
    plan: SubscriptionPlan.PREMIUM,
    expiresAt: null,
    startedAt: anchor,
    currentPeriodStartedAt: anchor,
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('PREMIUM: a spend on the 20th and one on the 3rd of next month share one period row', async () => {
    const anchor = new Date('2026-02-15T08:00:00.000Z');
    const { prisma, state } = buildPrisma({ subscription: premiumAnchoredAt(anchor) });
    const service = new EntitlementService(prisma);

    jest.useFakeTimers().setSystemTime(new Date('2026-02-20T12:00:00Z'));
    await service.consumeCredits('u1', 3, CreditReason.STORY_SPEND, STORY_REF);
    jest.setSystemTime(new Date('2026-03-03T12:00:00Z'));
    await service.consumeCredits('u1', 6, CreditReason.STORY_SPEND, { type: 'story', id: 's2' });

    expect(state.usage).toHaveLength(1);
    expect(state.usage[0]).toMatchObject({ periodStart: anchor, count: 9 });
    expect((await service.resolve('u1')).credits.quota).toEqual({ limit: 30, used: 9 });
    expect(state.balance).toBe(0);
  });

  it('FREE: the quota stays on the UTC calendar month', async () => {
    const { prisma, state } = buildPrisma({ subscription: null, balance: 10 });
    const service = new EntitlementService(prisma);

    jest.useFakeTimers().setSystemTime(new Date('2026-02-20T12:00:00Z'));
    await service.consumeCredits('u1', 3, CreditReason.STORY_SPEND, STORY_REF);
    jest.setSystemTime(new Date('2026-03-03T12:00:00Z'));
    await service.consumeCredits('u1', 3, CreditReason.STORY_SPEND, { type: 'story', id: 's2' });

    expect(state.usage.map((row) => row.periodStart.toISOString())).toEqual([
      '2026-02-01T00:00:00.000Z',
      '2026-03-01T00:00:00.000Z',
    ]);
    expect(state.usage.map((row) => row.count)).toEqual([3, 3]);
    expect(state.balance).toBe(10); // both months fully covered by quota
  });

  it('a refund after the period rolled over lands in the CURRENT period', async () => {
    const anchor = new Date('2026-02-15T08:00:00.000Z');
    const { prisma, state } = buildPrisma({ subscription: premiumAnchoredAt(anchor) });
    const service = new EntitlementService(prisma);

    jest.useFakeTimers().setSystemTime(new Date('2026-02-20T12:00:00Z'));
    await service.consumeCredits('u1', 3, CreditReason.STORY_SPEND, STORY_REF);
    // Next billing period (from Mar 15): a new spend opens the new period row.
    jest.setSystemTime(new Date('2026-03-16T12:00:00Z'));
    await service.consumeCredits('u1', 3, CreditReason.STORY_SPEND, { type: 'story', id: 's2' });
    await service.refundCreditsForRef('u1', 'story', 's1');

    const byPeriod = Object.fromEntries(
      state.usage.map((row) => [row.periodStart.toISOString(), row.count]),
    );
    expect(byPeriod).toEqual({
      '2026-02-15T08:00:00.000Z': 3, // the old period is history
      '2026-03-15T08:00:00.000Z': 0, // the allowance comes back where it is usable
    });
    expect(state.ledger.at(-1)).toMatchObject({ reason: CreditReason.REFUND, quotaPart: -3 });
  });

  it('missed renewal webhooks: the period steps forward from a stale anchor', async () => {
    const staleAnchor = new Date('2025-12-15T08:00:00.000Z'); // last RENEWAL seen 3 months ago
    const { prisma, state } = buildPrisma({ subscription: premiumAnchoredAt(staleAnchor) });
    const service = new EntitlementService(prisma);

    jest.useFakeTimers().setSystemTime(new Date('2026-03-20T12:00:00Z'));
    await service.consumeCredits('u1', 3, CreditReason.STORY_SPEND, STORY_REF);

    expect(state.usage).toHaveLength(1);
    expect(state.usage[0]?.periodStart).toEqual(new Date('2026-03-15T08:00:00.000Z'));
  });

  it('falls back to startedAt when no period anchor was recorded', async () => {
    const startedAt = new Date('2026-01-10T06:00:00.000Z');
    const { prisma, state } = buildPrisma({
      subscription: {
        status: SubscriptionStatus.ACTIVE,
        plan: SubscriptionPlan.PREMIUM,
        expiresAt: null,
        startedAt,
        currentPeriodStartedAt: null,
      },
    });
    jest.useFakeTimers().setSystemTime(new Date('2026-03-20T12:00:00Z'));
    await new EntitlementService(prisma).consumeCredits(
      'u1',
      3,
      CreditReason.STORY_SPEND,
      STORY_REF,
    );
    expect(state.usage[0]?.periodStart).toEqual(new Date('2026-03-10T06:00:00.000Z'));
  });
});
