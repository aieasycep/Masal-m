import { Logger } from '@nestjs/common';
import {
  CreditReason,
  DEFAULT_MONETIZATION,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@masalim/types';
import type { SubscriptionEvent } from '@masalim/validation';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EntitlementService } from './entitlement.service';
import type { MonetizationConfig, MonetizationConfigService } from './monetization-config.service';
import { SubscriptionService } from './subscription.service';

// The pro-rating path logs at warn level; keep the test output clean.
Logger.overrideLogger(false);

interface SubscriptionRow {
  userId: string;
  provider: string;
  productId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startedAt: Date;
  expiresAt: Date | null;
  currentPeriodStartedAt?: Date | null;
  latestEventAt: Date;
}

const T0 = Date.UTC(2026, 1, 15, 8, 0, 0); // 2026-02-15T08:00:00Z
const MONTH_MS = 30 * 24 * 3600 * 1000;

function buildService(options: { plan?: SubscriptionPlan } = {}) {
  const state: { subscription: SubscriptionRow | null } = { subscription: null };
  const config: MonetizationConfig = {
    currency: 'TRY',
    subscription: { ...DEFAULT_MONETIZATION.subscription },
    packs: DEFAULT_MONETIZATION.packs.map((pack) => ({ ...pack })),
  };

  const prisma = {
    user: {
      findUnique: jest.fn(async () => ({ id: 'u1' })),
      update: jest.fn(async () => undefined),
    },
    subscription: {
      findUnique: jest.fn(async () => state.subscription),
      upsert: jest.fn(
        async ({
          create,
          update,
        }: {
          create: SubscriptionRow;
          update: Partial<SubscriptionRow>;
        }) => {
          state.subscription =
            state.subscription == null ? { ...create } : { ...state.subscription, ...update };
          return state.subscription;
        },
      ),
    },
  } as unknown as PrismaService;

  const entitlements = {
    planFor: jest.fn(async () => options.plan ?? SubscriptionPlan.FREE),
    grantCredits: jest.fn<
      Promise<boolean>,
      [string, number, CreditReason, { type: string; id: string }, string]
    >(async () => true),
  };
  const monetization = {
    get: jest.fn(async () => config),
    packFor: jest.fn(
      async (productId: string) =>
        config.packs.find((pack) => pack.productId === productId) ?? null,
    ),
  };

  const service = new SubscriptionService(
    prisma,
    entitlements as unknown as EntitlementService,
    monetization as unknown as MonetizationConfigService,
  );
  return { service, state, entitlements, prisma };
}

function packPurchase(productId: string): SubscriptionEvent {
  return {
    eventType: 'NON_RENEWING_PURCHASE',
    appUserId: 'u1',
    productId,
    eventTimeMs: T0,
    expirationAtMs: null,
    purchasedAtMs: T0,
    environment: 'SANDBOX',
    eventId: `evt-${productId}`,
  };
}

function planEvent(
  eventType: Exclude<SubscriptionEvent['eventType'], 'NON_RENEWING_PURCHASE'>,
  overrides: Partial<SubscriptionEvent> = {},
): SubscriptionEvent {
  return {
    eventType,
    appUserId: 'u1',
    productId: 'masalim_premium_monthly',
    eventTimeMs: T0,
    expirationAtMs: T0 + MONTH_MS,
    purchasedAtMs: T0,
    environment: 'SANDBOX',
    eventId: null,
    ...overrides,
  };
}

describe('SubscriptionService — credit packs by tier (D.2)', () => {
  it('pro-rates a _member pack bought by a FREE account to what the price buys at the standard rate', async () => {
    const { service, entitlements } = buildService({ plan: SubscriptionPlan.FREE });

    await service.applyEvent(packPurchase('masalim_credits_6_member'), 'mock');
    await service.applyEvent(packPurchase('masalim_credits_12_member'), 'mock');
    await service.applyEvent(packPurchase('masalim_credits_30_member'), 'mock');

    // 239.99 / (299.99 / 6) = 4.8 → 4; 479.99 / 49.999 = 9.6 → 9; 1199.99 / 49.9997 → 23
    expect(entitlements.grantCredits.mock.calls.map((call) => call[1])).toEqual([4, 9, 23]);
    expect(entitlements.grantCredits).toHaveBeenCalledWith(
      'u1',
      4,
      CreditReason.PURCHASE,
      { type: 'product', id: 'masalim_credits_6_member' },
      'mock:evt-masalim_credits_6_member',
    );
  });

  it('grants a _std pack unchanged to a FREE account', async () => {
    const { service, entitlements } = buildService({ plan: SubscriptionPlan.FREE });
    await service.applyEvent(packPurchase('masalim_credits_6_std'), 'mock');
    expect(entitlements.grantCredits).toHaveBeenCalledWith(
      'u1',
      6,
      CreditReason.PURCHASE,
      expect.anything(),
      expect.any(String),
    );
  });

  it('grants PREMIUM accounts the full pack for both tiers (an overpaid _std is never cut)', async () => {
    const { service, entitlements } = buildService({ plan: SubscriptionPlan.PREMIUM });
    await service.applyEvent(packPurchase('masalim_credits_6_member'), 'mock');
    await service.applyEvent(packPurchase('masalim_credits_6_std'), 'mock');
    expect(entitlements.grantCredits.mock.calls.map((call) => call[1])).toEqual([6, 6]);
  });

  it('ignores unknown products', async () => {
    const { service, entitlements } = buildService();
    await service.applyEvent(packPurchase('masalim_credits_999_gold'), 'mock');
    expect(entitlements.grantCredits).not.toHaveBeenCalled();
  });
});

describe('SubscriptionService — billing-period anchor (D.1)', () => {
  it('INITIAL_PURCHASE creates the subscription anchored on purchasedAtMs', async () => {
    const { service, state } = buildService();
    await service.applyEvent(planEvent('INITIAL_PURCHASE'), 'revenuecat');
    expect(state.subscription).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      plan: SubscriptionPlan.PREMIUM,
      startedAt: new Date(T0),
      currentPeriodStartedAt: new Date(T0),
    });
  });

  it('RENEWAL moves the anchor; CANCELLATION / BILLING_ISSUE / EXPIRATION leave it alone', async () => {
    const { service, state } = buildService();
    await service.applyEvent(planEvent('INITIAL_PURCHASE'), 'revenuecat');
    const renewedAt = T0 + MONTH_MS;
    await service.applyEvent(
      planEvent('RENEWAL', {
        eventTimeMs: renewedAt + 5_000, // webhook delivered a few seconds after the charge
        purchasedAtMs: renewedAt,
        expirationAtMs: renewedAt + MONTH_MS,
      }),
      'revenuecat',
    );
    expect(state.subscription?.currentPeriodStartedAt).toEqual(new Date(renewedAt));

    for (const eventType of ['CANCELLATION', 'BILLING_ISSUE', 'EXPIRATION'] as const) {
      await service.applyEvent(
        planEvent(eventType, { eventTimeMs: renewedAt + 10_000, purchasedAtMs: null }),
        'revenuecat',
      );
      expect(state.subscription?.currentPeriodStartedAt).toEqual(new Date(renewedAt));
    }
    expect(state.subscription?.status).toBe(SubscriptionStatus.EXPIRED);
  });

  it('falls back to the event time when the store sends no purchase time', async () => {
    const { service, state } = buildService();
    await service.applyEvent(
      planEvent('INITIAL_PURCHASE', { eventTimeMs: T0 + 1_234, purchasedAtMs: null }),
      'revenuecat',
    );
    expect(state.subscription?.currentPeriodStartedAt).toEqual(new Date(T0 + 1_234));
  });

  it('UNCANCELLATION re-anchors on the purchase time it carries', async () => {
    const { service, state } = buildService();
    await service.applyEvent(planEvent('INITIAL_PURCHASE'), 'revenuecat');
    await service.applyEvent(
      planEvent('CANCELLATION', { eventTimeMs: T0 + 1_000, purchasedAtMs: null }),
      'revenuecat',
    );
    await service.applyEvent(
      planEvent('UNCANCELLATION', { eventTimeMs: T0 + 2_000, purchasedAtMs: T0 + 500 }),
      'revenuecat',
    );
    expect(state.subscription).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStartedAt: new Date(T0 + 500),
    });
  });
});
