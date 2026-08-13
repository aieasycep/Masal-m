import { create } from 'zustand';
import type { AuthSession } from '@masalim/validation';
import { secureTokenStore } from '../lib/token-store';

export type SessionUser = AuthSession['user'];

interface AuthState {
  status: 'restoring' | 'signedOut' | 'signedIn';
  user: SessionUser | null;
  /** Restore tokens from SecureStore at cold start. */
  restore: () => Promise<void>;
  setSession: (session: AuthSession) => Promise<void>;
  setUser: (user: SessionUser) => void;
  clearSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'restoring',
  user: null,

  restore: async () => {
    const tokens = await secureTokenStore.getTokens();
    set({ status: tokens == null ? 'signedOut' : 'signedIn' });
  },

  setSession: async (session) => {
    await secureTokenStore.setTokens(session.tokens);
    set({ status: 'signedIn', user: session.user });
  },

  setUser: (user) => set({ user }),

  clearSession: async () => {
    await secureTokenStore.setTokens(null);
    set({ status: 'signedOut', user: null });
  },
}));
