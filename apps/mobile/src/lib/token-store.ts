import * as SecureStore from 'expo-secure-store';
import type { TokenStore } from '@masalim/api-client';
import type { AuthTokens } from '@masalim/validation';

const KEY = 'masalim.auth.tokens';
const USER_ID_KEY = 'masalim.auth.userId';

/** Tokens live in the platform keychain/keystore — never AsyncStorage (§11). */
export const secureTokenStore: TokenStore = {
  async getTokens(): Promise<AuthTokens | null> {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as AuthTokens;
    } catch {
      await SecureStore.deleteItemAsync(KEY);
      return null;
    }
  },
  async setTokens(tokens: AuthTokens | null): Promise<void> {
    if (tokens == null) {
      await SecureStore.deleteItemAsync(KEY);
    } else {
      await SecureStore.setItemAsync(KEY, JSON.stringify(tokens));
    }
  },
};

/**
 * The signed-in user's id, persisted next to the tokens so a cold start can
 * re-identify device-level SDKs (RevenueCat) before `/users/me` resolves.
 * Missing for sessions created before this key existed — callers fall back
 * to `/users/me`.
 */
export async function getStoredUserId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(USER_ID_KEY);
  } catch {
    return null;
  }
}

export async function setStoredUserId(userId: string | null): Promise<void> {
  try {
    if (userId == null) {
      await SecureStore.deleteItemAsync(USER_ID_KEY);
    } else {
      await SecureStore.setItemAsync(USER_ID_KEY, userId);
    }
  } catch {
    // Best-effort: the id is a convenience cache, /users/me remains the source.
  }
}
