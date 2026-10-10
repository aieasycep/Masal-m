import { create } from 'zustand';
import type { AuthSession } from '@masalim/validation';
import { api } from '../lib/api';
import { purchasesSession } from '../lib/purchases';
import { unregisterPush } from '../lib/push';
import { resetPerUserState } from '../lib/reset-user-state';
import { sessionEvents } from '../lib/session-events';
import { getStoredUserId, secureTokenStore, setStoredUserId } from '../lib/token-store';

export type SessionUser = AuthSession['user'];

export interface SignOutOptions {
  /**
   * false → skip `POST /auth/logout` because the server already revoked the
   * session (account deletion). Default true: revoke THIS device's refresh
   * token only, other devices stay signed in.
   */
  remote?: boolean;
}

interface AuthState {
  status: 'restoring' | 'signedOut' | 'signedIn';
  user: SessionUser | null;
  /** Restore tokens from SecureStore at cold start. */
  restore: () => Promise<void>;
  setSession: (session: AuthSession) => Promise<void>;
  setUser: (user: SessionUser) => void;
  /** Local teardown only (tokens, per-user caches). Prefer `signOut`. */
  clearSession: () => Promise<void>;
  /**
   * The single sign-out path for every screen: drop this device's push token
   * and refresh token while the access token is still valid, detach the store
   * SDK identity, then clear local state. Never throws — a dead network still
   * signs the user out locally.
   */
  signOut: (opts?: SignOutOptions) => Promise<void>;
}

const noop = (): undefined => undefined;

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'restoring',
  user: null,

  restore: async () => {
    const tokens = await secureTokenStore.getTokens();
    if (tokens != null) {
      // Re-attach the store SDK to this user; best-effort and never blocks the splash.
      const userId = await getStoredUserId();
      if (userId != null) void purchasesSession.identify(userId);
    }
    set({ status: tokens == null ? 'signedOut' : 'signedIn' });
  },

  setSession: async (session) => {
    // A sign-in may be a different account than the last one on this device —
    // drop the previous account's cached data before the new session starts.
    await resetPerUserState();
    await secureTokenStore.setTokens(session.tokens);
    await setStoredUserId(session.user.id);
    set({ status: 'signedIn', user: session.user });
    void purchasesSession.identify(session.user.id);
  },

  setUser: (user) => set({ user }),

  clearSession: async () => {
    await secureTokenStore.setTokens(null);
    await setStoredUserId(null);
    await resetPerUserState();
    set({ status: 'signedOut', user: null });
  },

  signOut: async (opts) => {
    // Order matters: both remote calls need the live access token.
    await unregisterPush().catch(noop);
    if (opts?.remote !== false) {
      const tokens = await secureTokenStore.getTokens().catch(() => null);
      await api.auth.logout(tokens?.refreshToken).catch(noop);
    }
    await purchasesSession.logOut().catch(noop);
    await get().clearSession();
  },
}));

// The api client signals a rejected refresh here (see src/lib/api.ts) — the
// session is already gone server-side, so only local teardown is left.
sessionEvents.onExpired(() => {
  void useAuthStore.getState().clearSession();
});
