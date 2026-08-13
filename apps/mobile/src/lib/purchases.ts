import Purchases, { PURCHASES_ERROR_CODE, type PurchasesPackage } from 'react-native-purchases';
import { SubscriptionPlan } from '@masalim/types';
import { api } from './api';
import { queryClient } from './query';

/**
 * PurchasesGateway (§37, plan §8.1) — the single store-purchases seam.
 *
 * Selected by `EXPO_PUBLIC_PURCHASES_PROVIDER` ('mock' default | 'revenuecat').
 * Entitlement truth ALWAYS stays server-side: the mock gateway drives the same
 * normalized backend pipeline as the RevenueCat webhook, and after any
 * purchase/restore both gateways invalidate ['entitlements'] + ['me'] so the
 * UI re-reads the backend-resolved plan.
 */

export interface Offering {
  productId: 'masalim_premium_monthly' | 'masalim_premium_yearly';
  period: 'monthly' | 'yearly';
  /** Display price — placeholder ₺ pricing in mock mode. */
  priceLabel: string;
}

export interface PurchasesGateway {
  getOfferings(): Promise<Offering[]>;
  purchase(productId: Offering['productId']): Promise<{ success: boolean; cancelled?: boolean }>;
  restore(): Promise<{ success: boolean }>;
}

/** Server-resolved entitlements drive the UI — refetch them after store events. */
async function invalidateEntitlements(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['entitlements'] }),
    queryClient.invalidateQueries({ queryKey: ['me'] }),
  ]);
}

/**
 * Mock IAP — dev only. `POST /subscription/mock/purchase` emits the same
 * normalized SubscriptionEvent the RevenueCat webhook does, so the real
 * entitlement flip happens server-side exactly like production.
 */
class MockPurchasesGateway implements PurchasesGateway {
  getOfferings(): Promise<Offering[]> {
    // Placeholder ₺ pricing — real store pricing (App Store / Play / RevenueCat
    // offerings) replaces these labels in the RevenueCat gateway.
    return Promise.resolve([
      { productId: 'masalim_premium_monthly', period: 'monthly', priceLabel: '₺129,99' },
      { productId: 'masalim_premium_yearly', period: 'yearly', priceLabel: '₺899,99' },
    ]);
  }

  async purchase(
    productId: Offering['productId'],
  ): Promise<{ success: boolean; cancelled?: boolean }> {
    await api.subscription.mockPurchase({ productId });
    await invalidateEntitlements();
    return { success: true };
  }

  async restore(): Promise<{ success: boolean }> {
    // No store receipts in mock mode — the backend already knows the plan.
    const subscription = await api.subscription.get();
    await invalidateEntitlements();
    return { success: subscription.plan === SubscriptionPlan.PREMIUM };
  }
}

/** RevenueCat rejections carry a cancellation marker — never surface those as errors. */
function isUserCancelled(error: unknown): boolean {
  if (typeof error !== 'object' || error == null) return false;
  const maybe = error as { code?: unknown; userCancelled?: unknown };
  return (
    maybe.userCancelled === true ||
    String(maybe.code) === String(PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR)
  );
}

/**
 * Real store purchases via react-native-purchases. The RevenueCat webhook
 * feeds the backend, which owns the entitlement flip — this gateway only
 * drives the store sheet and then re-reads server state.
 */
class RevenueCatPurchasesGateway implements PurchasesGateway {
  private configured = false;
  /** Last-fetched packages by canonical productId — purchase() consumes these. */
  private packages = new Map<Offering['productId'], PurchasesPackage>();

  /** Lazy one-time configure; a missing key leaves the gateway inert. */
  private ensureConfigured(): boolean {
    if (this.configured) return true;
    const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_KEY ?? '';
    if (apiKey.length === 0) return false;
    Purchases.configure({ apiKey });
    this.configured = true;
    return true;
  }

  async getOfferings(): Promise<Offering[]> {
    if (!this.ensureConfigured()) return [];
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (current == null) return [];

    const result: Offering[] = [];
    if (current.monthly != null) {
      this.packages.set('masalim_premium_monthly', current.monthly);
      result.push({
        productId: 'masalim_premium_monthly',
        period: 'monthly',
        priceLabel: current.monthly.product.priceString,
      });
    }
    if (current.annual != null) {
      this.packages.set('masalim_premium_yearly', current.annual);
      result.push({
        productId: 'masalim_premium_yearly',
        period: 'yearly',
        priceLabel: current.annual.product.priceString,
      });
    }
    return result;
  }

  async purchase(
    productId: Offering['productId'],
  ): Promise<{ success: boolean; cancelled?: boolean }> {
    if (!this.ensureConfigured()) return { success: false };
    let pkg = this.packages.get(productId);
    if (pkg == null) {
      // Deep-link entry without a prior getOfferings() — fetch once.
      await this.getOfferings();
      pkg = this.packages.get(productId);
    }
    if (pkg == null) return { success: false };

    try {
      await Purchases.purchasePackage(pkg);
    } catch (error) {
      if (isUserCancelled(error)) return { success: false, cancelled: true };
      throw error;
    } finally {
      // The webhook may land at any moment — always re-read server entitlements.
      await invalidateEntitlements();
    }
    return { success: true };
  }

  async restore(): Promise<{ success: boolean }> {
    if (!this.ensureConfigured()) return { success: false };
    try {
      await Purchases.restorePurchases();
    } finally {
      await invalidateEntitlements();
    }
    // Success means the BACKEND sees premium (webhook processed) — not the store.
    const subscription = await api.subscription.get();
    return { success: subscription.plan === SubscriptionPlan.PREMIUM };
  }
}

/** Env-selected singleton — 'mock' unless explicitly set to 'revenuecat'. */
export const purchases: PurchasesGateway =
  process.env.EXPO_PUBLIC_PURCHASES_PROVIDER === 'revenuecat'
    ? new RevenueCatPurchasesGateway()
    : new MockPurchasesGateway();
