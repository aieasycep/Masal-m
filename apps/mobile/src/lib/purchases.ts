import Purchases, { PURCHASES_ERROR_CODE, type PurchasesPackage } from 'react-native-purchases';
import { SubscriptionPlan } from '@masalim/types';
import { api } from './api';
import { queryClient } from './query';

/**
 * PurchasesGateway (§37, plan §8.1) — the single store-purchases seam.
 *
 * Selected by `EXPO_PUBLIC_PURCHASES_PROVIDER` ('mock' default | 'revenuecat').
 * PRODUCT CATALOG + PRICES come from the server (`/subscription/offerings`,
 * PricingConfig-backed) so sticker prices change without an app update; this
 * gateway only executes the purchase for a given store productId — the
 * subscription or a consumable credit pack — and re-reads server entitlements.
 * The mock gateway drives the same normalized backend pipeline as the
 * RevenueCat webhook.
 */
export interface PurchasesGateway {
  purchase(productId: string): Promise<{ success: boolean; cancelled?: boolean }>;
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
 * Mock IAP — dev/staging only. `POST /subscription/mock/purchase` emits the
 * same normalized SubscriptionEvent the RevenueCat webhook does (INITIAL_
 * PURCHASE for the subscription, NON_RENEWING_PURCHASE for credit packs), so
 * the real entitlement/credit flip happens server-side exactly like production.
 */
class MockPurchasesGateway implements PurchasesGateway {
  async purchase(productId: string): Promise<{ success: boolean; cancelled?: boolean }> {
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
 * drives the store sheet for the requested product and re-reads server state.
 */
class RevenueCatPurchasesGateway implements PurchasesGateway {
  private configured = false;

  /** Lazy one-time configure; a missing key leaves the gateway inert. */
  private ensureConfigured(): boolean {
    if (this.configured) return true;
    const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_KEY ?? '';
    if (apiKey.length === 0) return false;
    Purchases.configure({ apiKey });
    this.configured = true;
    return true;
  }

  /** Find the store package carrying this productId across all offerings. */
  private async packageFor(productId: string): Promise<PurchasesPackage | null> {
    const offerings = await Purchases.getOfferings();
    for (const offering of Object.values(offerings.all)) {
      for (const pkg of offering.availablePackages) {
        if (pkg.product.identifier === productId) return pkg;
      }
    }
    return null;
  }

  async purchase(productId: string): Promise<{ success: boolean; cancelled?: boolean }> {
    if (!this.ensureConfigured()) return { success: false };
    const pkg = await this.packageFor(productId);
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
