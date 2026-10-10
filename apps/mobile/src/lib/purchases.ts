import { Platform } from 'react-native';
import Purchases, { PURCHASES_ERROR_CODE, type PurchasesPackage } from 'react-native-purchases';
import { SubscriptionPlan } from '@masalim/types';
import { api } from './api';
import { queryClient } from './query';
import { getStoredUserId, setStoredUserId } from './token-store';

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

/**
 * Store-SDK identity. The RevenueCat app user id MUST be our user id so the
 * webhook can attribute the purchase; identity follows the session (sign-in,
 * cold-start restore, sign-out). Every method is best-effort and never throws.
 */
export interface PurchasesSession {
  identify(userId: string): Promise<void>;
  logOut(): Promise<void>;
}

const USE_REVENUECAT = process.env.EXPO_PUBLIC_PURCHASES_PROVIDER === 'revenuecat';

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

function warnDev(message: string, error: unknown): void {
  if (__DEV__) console.warn(`[purchases] ${message}`, error);
}

/**
 * Per-platform public SDK key. Literal `process.env.X` member access so Expo
 * inlines the values at bundle time (a computed key would stay undefined).
 */
function revenueCatApiKey(): string | null {
  const key = Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  });
  return key != null && key.length > 0 ? key : null;
}

/** One-time SDK configure state, shared by the session and the gateway. */
let revenueCatConfigured = false;

const revenueCatSession: PurchasesSession = {
  async identify(userId) {
    try {
      if (!revenueCatConfigured) {
        const apiKey = revenueCatApiKey();
        if (apiKey == null) return; // no key for this platform → gateway stays inert
        Purchases.configure({ apiKey, appUserID: userId });
        revenueCatConfigured = true;
        return;
      }
      const current = await Purchases.getAppUserID();
      if (current !== userId) {
        await Purchases.logIn(userId);
      }
    } catch (error) {
      warnDev('identify failed', error);
    }
  },

  async logOut() {
    try {
      if (!revenueCatConfigured) return;
      if (await Purchases.isAnonymous()) return;
      await Purchases.logOut();
    } catch (error) {
      warnDev('logOut failed', error);
    }
  },
};

const noopSession: PurchasesSession = {
  async identify() {},
  async logOut() {},
};

/**
 * Real store purchases via react-native-purchases. The RevenueCat webhook
 * feeds the backend, which owns the entitlement flip — this gateway only
 * drives the store sheet for the requested product and re-reads server state.
 */
class RevenueCatPurchasesGateway implements PurchasesGateway {
  /**
   * Identify the SDK as the signed-in user before any store call. The id is
   * cached in SecureStore at sign-in; sessions older than that cache fall back
   * to `/users/me` (and backfill the cache).
   */
  private async ensureIdentified(): Promise<boolean> {
    let userId = await getStoredUserId();
    if (userId == null) {
      try {
        userId = (await api.users.me()).id;
        await setStoredUserId(userId);
      } catch (error) {
        warnDev('could not resolve the user id', error);
        return false;
      }
    }
    await revenueCatSession.identify(userId);
    return revenueCatConfigured;
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
    if (!(await this.ensureIdentified())) return { success: false };
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
    if (!(await this.ensureIdentified())) return { success: false };
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
export const purchases: PurchasesGateway = USE_REVENUECAT
  ? new RevenueCatPurchasesGateway()
  : new MockPurchasesGateway();

/** Session identity for the store SDK — a no-op under the mock provider. */
export const purchasesSession: PurchasesSession = USE_REVENUECAT ? revenueCatSession : noopSession;
