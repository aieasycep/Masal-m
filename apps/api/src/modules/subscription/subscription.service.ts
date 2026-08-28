import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionPlan, SubscriptionStatus } from '@masalim/types';
import type { Subscription as SubscriptionDto, SubscriptionEvent } from '@masalim/validation';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from './entitlement.service';

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

    const status = statusForEvent(event.eventType);
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

function statusForEvent(eventType: SubscriptionEvent['eventType']): SubscriptionStatus {
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
