import { HttpStatus, Injectable } from '@nestjs/common';
import {
  EntitlementKey,
  ErrorCode,
  PLAN_ENTITLEMENTS,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@masalim/types';
import type { EntitlementsResponse } from '@masalim/validation';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';

type QuotaKey =
  | typeof EntitlementKey.STORY_MONTHLY_LIMIT
  | typeof EntitlementKey.ILLUSTRATION_MONTHLY_LIMIT;
type FeatureKey =
  | typeof EntitlementKey.PARENT_VOICE_CLONE
  | typeof EntitlementKey.PREMIUM_SYSTEM_VOICES
  | typeof EntitlementKey.HD_BOOK_EXPORT;

/** First day of the current month (UTC) — the quota period anchor. */
function currentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Backend entitlement engine (§37): the single source of truth for plan
 * features and quotas. UI gates read the same resolved set via
 * /subscription/entitlements; API guards enforce it server-side.
 */
@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  /** Effective plan: an unexpired ACTIVE/TRIALING/GRACE (or cancelled-but-paid) sub = PREMIUM. */
  async planFor(userId: string): Promise<SubscriptionPlan> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    if (sub == null) return SubscriptionPlan.FREE;
    const now = Date.now();
    const unexpired = sub.expiresAt == null || sub.expiresAt.getTime() > now;
    const active =
      sub.status === SubscriptionStatus.ACTIVE ||
      sub.status === SubscriptionStatus.TRIALING ||
      sub.status === SubscriptionStatus.GRACE ||
      (sub.status === SubscriptionStatus.CANCELLED && unexpired);
    return active && unexpired ? sub.plan : SubscriptionPlan.FREE;
  }

  async resolve(userId: string): Promise<EntitlementsResponse> {
    const plan = await this.planFor(userId);
    const matrix = PLAN_ENTITLEMENTS[plan];
    const periodStart = currentPeriodStart();
    const usage = await this.prisma.entitlementUsage.findMany({
      where: { userId, periodStart },
    });
    const used = (key: string): number => usage.find((row) => row.key === key)?.count ?? 0;

    return {
      plan,
      features: {
        [EntitlementKey.PARENT_VOICE_CLONE]: matrix.parentVoiceClone,
        [EntitlementKey.PREMIUM_SYSTEM_VOICES]: matrix.premiumSystemVoices,
        [EntitlementKey.HD_BOOK_EXPORT]: matrix.hdBookExport,
      },
      quotas: {
        [EntitlementKey.STORY_MONTHLY_LIMIT]: {
          limit: matrix.storyMonthlyLimit,
          used: used(EntitlementKey.STORY_MONTHLY_LIMIT),
        },
        [EntitlementKey.ILLUSTRATION_MONTHLY_LIMIT]: {
          limit: matrix.illustrationMonthlyLimit,
          used: used(EntitlementKey.ILLUSTRATION_MONTHLY_LIMIT),
        },
      },
    };
  }

  /** Boolean feature gate → ENTITLEMENT_REQUIRED (§37). */
  async requireFeature(userId: string, key: FeatureKey): Promise<void> {
    const resolved = await this.resolve(userId);
    if (!resolved.features[key]) {
      throw new AppException(
        ErrorCode.ENTITLEMENT_REQUIRED,
        `Feature "${key}" requires a premium subscription`,
        HttpStatus.FORBIDDEN,
        { key },
      );
    }
  }

  /**
   * Atomically consume one unit of a monthly quota → QUOTA_EXCEEDED when the
   * period budget is spent. Runs in a transaction so parallel submissions
   * cannot overshoot the limit.
   */
  async consumeQuota(userId: string, key: QuotaKey): Promise<void> {
    const plan = await this.planFor(userId);
    const matrix = PLAN_ENTITLEMENTS[plan];
    const limit =
      key === EntitlementKey.STORY_MONTHLY_LIMIT
        ? matrix.storyMonthlyLimit
        : matrix.illustrationMonthlyLimit;
    const periodStart = currentPeriodStart();

    await this.prisma.entitlementUsage.upsert({
      where: { userId_key_periodStart: { userId, key, periodStart } },
      create: { userId, key, periodStart, count: 0 },
      update: {},
    });
    // Conditional increment is atomic on the row: racing submissions serialize
    // on the row lock and the loser re-evaluates `count < limit`.
    const consumed = await this.prisma.entitlementUsage.updateMany({
      where: { userId, key, periodStart, count: { lt: limit } },
      data: { count: { increment: 1 } },
    });
    if (consumed.count === 0) {
      throw new AppException(
        ErrorCode.QUOTA_EXCEEDED,
        `Monthly quota for "${key}" is used up`,
        HttpStatus.FORBIDDEN,
        { key, limit },
      );
    }
  }

  /** Give back one consumed unit (job failed after enqueue) — floor at 0. */
  async refundQuota(userId: string, key: QuotaKey): Promise<void> {
    const periodStart = currentPeriodStart();
    await this.prisma.entitlementUsage.updateMany({
      where: { userId, key, periodStart, count: { gt: 0 } },
      data: { count: { decrement: 1 } },
    });
  }
}
