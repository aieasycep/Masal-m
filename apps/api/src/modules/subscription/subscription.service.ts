import { Injectable, Logger } from '@nestjs/common';
import { CreditReason, SubscriptionPlan, SubscriptionStatus } from '@masalim/types';
import type { Subscription as SubscriptionDto, SubscriptionEvent } from '@masalim/validation';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from './entitlement.service';
import { MonetizationConfigService } from './monetization-config.service';

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
      const idempotencyKey = `${provider}:${event.eventId ?? `${event.appUserId}:${event.eventTimeMs}`}`;
      const granted = await this.entitlements.grantCredits(
        user.id,
        pack.credits,
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
    const status = statusForEvent(event.eventType as Exclude<SubscriptionEvent['eventType'], 'NON_RENEWING_PURCHASE'>);
    const expiresAt = event.expirationAtMs == null ? null : new Date(event.expirationAtMs);

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
      },
      update: {
        provider,
        productId: event.productId,
        status,
        expiresAt,
        latestEventAt: eventAt,
      },
    });

    // Denormalized plan cache on User (fast reads for /users/me).
    const plan = await this.entitlements.planFor(user.id);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { subscriptionPlan: plan },
    });
  }
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
