import { Injectable, Logger } from '@nestjs/common';
import { CreditReason, SubscriptionPlan, SubscriptionStatus } from '@masalim/types';
import type { Subscription as SubscriptionDto, SubscriptionEvent } from '@masalim/validation';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from './entitlement.service';
import { MonetizationConfigService, type MonetizationConfig } from './monetization-config.service';

/**
 * Store-subscription sync (§37): consumes normalized events — RevenueCat
 * webhooks and the dev mock-IAP flow both feed this same pipeline, so the
 * whole entitlement path is exercised without a real store.
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly monetization: MonetizationConfigService,
  ) {}

  async get(userId: string): Promise<SubscriptionDto> {
    const [plan, sub] = await Promise.all([
      this.entitlements.planFor(userId),
      this.prisma.subscription.findUnique({ where: { userId } }),
    ]);
    return {
      plan,
      status: sub?.status ?? null,
      productId: sub?.productId ?? null,
      expiresAt: sub?.expiresAt?.toISOString() ?? null,
      trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
    };
  }

  async applyEvent(event: SubscriptionEvent, provider: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: event.appUserId } });
    if (user == null) {
      this.logger.warn({ appUserId: event.appUserId }, 'subscription event for unknown user');
      return;
    }

    // Consumable credit pack: grant credits (idempotent on the store event id),
    // plan/subscription state untouched.
    if (event.eventType === 'NON_RENEWING_PURCHASE') {
      const pack = await this.monetization.packFor(event.productId);
      if (pack == null) {
        this.logger.warn({ productId: event.productId }, 'credit purchase for unknown product');
        return;
      }
      const credits = await this.creditsForPurchase(user.id, pack);
      if (credits <= 0) {
        this.logger.error(
          { userId: user.id, productId: event.productId },
          'credit pack resolves to zero credits — nothing granted',
        );
        return;
      }
      const idempotencyKey = `${provider}:${event.eventId ?? `${event.appUserId}:${event.eventTimeMs}`}`;
      const granted = await this.entitlements.grantCredits(
        user.id,
        credits,
        CreditReason.PURCHASE,
        { type: 'product', id: event.productId },
        idempotencyKey,
      );
      if (!granted) {
        this.logger.warn({ idempotencyKey }, 'replayed credit purchase ignored');
      }
      return;
    }

    const eventAt = new Date(event.eventTimeMs);
    const existing = await this.prisma.subscription.findUnique({
      where: { userId: user.id },
    });
    // Webhooks can arrive out of order — never let an older event win.
    if (existing != null && existing.latestEventAt.getTime() > event.eventTimeMs) {
      this.logger.warn(
        { userId: user.id, eventType: event.eventType },
        'stale subscription event ignored',
      );
      return;
    }

    // NON_RENEWING_PURCHASE returned above — the remaining kinds drive plan state.
    const eventType = event.eventType as Exclude<
      SubscriptionEvent['eventType'],
      'NON_RENEWING_PURCHASE'
    >;
    const status = statusForEvent(eventType);
    const expiresAt = event.expirationAtMs == null ? null : new Date(event.expirationAtMs);
    // A purchase/renewal starts a new billing period: the Premium credit quota
    // is anchored on it (not on the calendar month). Other events leave the
    // period anchor alone.
    const periodStart = startsBillingPeriod(eventType)
      ? { currentPeriodStartedAt: new Date(event.purchasedAtMs ?? event.eventTimeMs) }
      : {};

    await this.prisma.subscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        provider,
        productId: event.productId,
        plan: SubscriptionPlan.PREMIUM,
        status,
        startedAt: eventAt,
        expiresAt,
        latestEventAt: eventAt,
        ...periodStart,
      },
      update: {
        provider,
        productId: event.productId,
        status,
        expiresAt,
        latestEventAt: eventAt,
        ...periodStart,
      },
    });

    // Denormalized plan cache on User (fast reads for /users/me).
    const plan = await this.entitlements.planFor(user.id);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { subscriptionPlan: plan },
    });
  }

  /**
   * Credits a pack purchase grants. Store products carry fixed prices, so the
   * cheaper `_member` packs are reachable by a FREE account (a lapsed
   * subscriber's cached paywall, a restored purchase): the owner decision is
   * to grant what was paid for — the member price converted at the standard
   * per-credit rate (239.99 TL ÷ 49.99 TL/credit → 4, not 6). PREMIUM users
   * buying a `_std` pack get it unchanged (they overpaid, never underpaid).
   */
  private async creditsForPurchase(userId: string, pack: CreditPack): Promise<number> {
    if (pack.tier !== SubscriptionPlan.PREMIUM) return pack.credits;
    const plan = await this.entitlements.planFor(userId);
    if (plan === SubscriptionPlan.PREMIUM) return pack.credits;

    const { packs } = await this.monetization.get();
    const standard = packs.find(
      (candidate) => candidate.tier === SubscriptionPlan.FREE && candidate.credits === pack.credits,
    );
    if (standard == null) {
      this.logger.warn(
        { userId, productId: pack.productId },
        'member pack bought by a FREE user — no standard counterpart, granted as is',
      );
      return pack.credits;
    }
    const standardPricePerCredit = Number(standard.priceTRY) / standard.credits;
    const credits = Math.floor(Number(pack.priceTRY) / standardPricePerCredit);
    this.logger.warn(
      { userId, productId: pack.productId, granted: credits },
      'member pack bought by a FREE user — pro-rated',
    );
    return credits;
  }
}

type CreditPack = MonetizationConfig['packs'][number];

function startsBillingPeriod(
  eventType: Exclude<SubscriptionEvent['eventType'], 'NON_RENEWING_PURCHASE'>,
): boolean {
  return (
    eventType === 'INITIAL_PURCHASE' || eventType === 'RENEWAL' || eventType === 'UNCANCELLATION'
  );
}

function statusForEvent(
  eventType: Exclude<SubscriptionEvent['eventType'], 'NON_RENEWING_PURCHASE'>,
): SubscriptionStatus {
  switch (eventType) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
      return SubscriptionStatus.ACTIVE;
    case 'CANCELLATION':
      return SubscriptionStatus.CANCELLED;
    case 'EXPIRATION':
      return SubscriptionStatus.EXPIRED;
    case 'BILLING_ISSUE':
      return SubscriptionStatus.GRACE;
  }
}
