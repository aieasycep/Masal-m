import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CreditReason,
  EntitlementKey,
  ErrorCode,
  PLAN_ENTITLEMENTS,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@masalim/types';
import type { EntitlementsResponse } from '@masalim/validation';
import { Prisma } from '@masalim/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';

type FeatureKey =
  | typeof EntitlementKey.PARENT_VOICE_CLONE
  | typeof EntitlementKey.PREMIUM_SYSTEM_VOICES
  | typeof EntitlementKey.HD_BOOK_EXPORT;

type SpendReason =
  | typeof CreditReason.STORY_SPEND
  | typeof CreditReason.EXTRA_NARRATION_SPEND
  | typeof CreditReason.EXTRA_ILLUSTRATION_SPEND;

type GrantReason =
  | typeof CreditReason.SIGNUP_GIFT
  | typeof CreditReason.PURCHASE
  | typeof CreditReason.ADMIN_ADJUST;

const SPEND_REASONS = [
  CreditReason.STORY_SPEND,
  CreditReason.EXTRA_NARRATION_SPEND,
  CreditReason.EXTRA_ILLUSTRATION_SPEND,
] as const;

/** First day of the current month (UTC) — the quota period anchor. */
function currentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Backend entitlement + credit engine (§37): the single source of truth for
 * plan features and credits. Spending draws from the monthly quota first
 * (resets each month, no rollover), then from the purchased balance (never
 * expires); every balance change is an append-only CreditLedger row, and
 * refunds reverse the exact quota/balance split of the original spend.
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
    const [usage, user] = await Promise.all([
      this.prisma.entitlementUsage.findUnique({
        where: {
          userId_key_periodStart: {
            userId,
            key: EntitlementKey.CREDIT_MONTHLY_QUOTA,
            periodStart,
          },
        },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { creditBalance: true } }),
    ]);

    return {
      plan,
      features: {
        [EntitlementKey.PARENT_VOICE_CLONE]: matrix.parentVoiceClone,
        [EntitlementKey.PREMIUM_SYSTEM_VOICES]: matrix.premiumSystemVoices,
        [EntitlementKey.HD_BOOK_EXPORT]: matrix.hdBookExport,
      },
      credits: {
        quota: {
          limit: matrix.monthlyCreditQuota,
          used: Math.min(usage?.count ?? 0, matrix.monthlyCreditQuota),
        },
        balance: user?.creditBalance ?? 0,
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
   * Atomically spend `amount` credits: monthly quota first, remainder from the
   * purchased balance. Not enough of either → INSUFFICIENT_CREDITS and nothing
   * is spent. The written ledger row records the quota/balance split so
   * `refundCreditsForRef` can reverse it exactly.
   */
  async consumeCredits(
    userId: string,
    amount: number,
    reason: SpendReason,
    ref: { type: string; id: string },
  ): Promise<void> {
    if (amount <= 0) return;
    const plan = await this.planFor(userId);
    const limit = PLAN_ENTITLEMENTS[plan].monthlyCreditQuota;
    const key = EntitlementKey.CREDIT_MONTHLY_QUOTA;
    const periodStart = currentPeriodStart();

    await this.prisma.entitlementUsage.upsert({
      where: { userId_key_periodStart: { userId, key, periodStart } },
      create: { userId, key, periodStart, count: 0 },
      update: {},
    });

    await this.prisma.$transaction(async (tx) => {
      // Quota draw via optimistic CAS on the usage row: racing submissions
      // serialize on `count` and the loser re-reads the remaining budget.
      let quotaPart = 0;
      for (let attempt = 0; ; attempt++) {
        const usage = await tx.entitlementUsage.findUnique({
          where: { userId_key_periodStart: { userId, key, periodStart } },
          select: { count: true },
        });
        const used = usage?.count ?? 0;
        quotaPart = Math.min(amount, Math.max(0, limit - used));
        if (quotaPart === 0) break;
        const updated = await tx.entitlementUsage.updateMany({
          where: { userId, key, periodStart, count: used },
          data: { count: { increment: quotaPart } },
        });
        if (updated.count === 1) break;
        if (attempt >= 4) {
          throw new AppException(
            ErrorCode.INTERNAL,
            'Credit quota is busy, please retry',
            HttpStatus.CONFLICT,
          );
        }
      }

      const balancePart = amount - quotaPart;
      if (balancePart > 0) {
        const updated = await tx.user.updateMany({
          where: { id: userId, creditBalance: { gte: balancePart } },
          data: { creditBalance: { decrement: balancePart } },
        });
        if (updated.count === 0) {
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: { creditBalance: true },
          });
          // Throwing aborts the transaction — the quota draw above rolls back.
          throw new AppException(
            ErrorCode.INSUFFICIENT_CREDITS,
            'Not enough credits for this action',
            HttpStatus.PAYMENT_REQUIRED,
            {
              needed: amount,
              quotaAvailable: quotaPart,
              balance: user?.creditBalance ?? 0,
            },
          );
        }
      }

      const after = await tx.user.findUnique({
        where: { id: userId },
        select: { creditBalance: true },
      });
      await tx.creditLedger.create({
        data: {
          userId,
          delta: -balancePart,
          quotaPart,
          reason,
          refType: ref.type,
          refId: ref.id,
          balanceAfter: after?.creditBalance ?? 0,
        },
      });
    });
  }

  /**
   * Reverse the most recent spend recorded for a reference (job failed after
   * enqueue). Idempotent: the refund row's unique key is derived from the
   * spend row, so a double refund silently no-ops. Quota is returned into the
   * CURRENT period (floor 0) — if the month rolled over in between, the user
   * simply gets the allowance back where it is still usable.
   */
  async refundCreditsForRef(userId: string, refType: string, refId: string): Promise<void> {
    const spend = await this.prisma.creditLedger.findFirst({
      where: { userId, refType, refId, reason: { in: [...SPEND_REASONS] } },
      orderBy: { createdAt: 'desc' },
    });
    if (spend == null) return;
    const balancePart = -spend.delta;
    const quotaPart = spend.quotaPart;
    const key = EntitlementKey.CREDIT_MONTHLY_QUOTA;
    const periodStart = currentPeriodStart();

    try {
      await this.prisma.$transaction(async (tx) => {
        if (balancePart > 0) {
          await tx.user.update({
            where: { id: userId },
            data: { creditBalance: { increment: balancePart } },
          });
        }
        if (quotaPart > 0) {
          const usage = await tx.entitlementUsage.findUnique({
            where: { userId_key_periodStart: { userId, key, periodStart } },
            select: { count: true },
          });
          if (usage != null) {
            await tx.entitlementUsage.update({
              where: { userId_key_periodStart: { userId, key, periodStart } },
              data: { count: Math.max(0, usage.count - quotaPart) },
            });
          }
        }
        const after = await tx.user.findUnique({
          where: { id: userId },
          select: { creditBalance: true },
        });
        await tx.creditLedger.create({
          data: {
            userId,
            delta: balancePart,
            quotaPart: -quotaPart,
            reason: CreditReason.REFUND,
            refType,
            refId,
            idempotencyKey: `refund:${spend.id}`,
            balanceAfter: after?.creditBalance ?? 0,
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) return; // already refunded
      throw error;
    }
  }

  /**
   * Add credits to the purchased balance (gift, pack purchase, admin fix).
   * Idempotent on `idempotencyKey` — a replayed store webhook grants once.
   * Returns false when the grant was already applied.
   */
  async grantCredits(
    userId: string,
    amount: number,
    reason: GrantReason,
    ref: { type: string; id: string },
    idempotencyKey: string,
  ): Promise<boolean> {
    if (amount <= 0) return false;
    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: userId },
          data: { creditBalance: { increment: amount } },
          select: { creditBalance: true },
        });
        await tx.creditLedger.create({
          data: {
            userId,
            delta: amount,
            quotaPart: 0,
            reason,
            refType: ref.type,
            refId: ref.id,
            idempotencyKey,
            balanceAfter: user.creditBalance,
          },
        });
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }
}
