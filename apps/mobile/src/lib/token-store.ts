import * as SecureStore from 'expo-secure-store';
import type { TokenStore } from '@masalim/api-client';
import type { AuthTokens } from '@masalim/validation';

const KEY = 'masalim.auth.tokens';

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
