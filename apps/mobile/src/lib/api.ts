import { MasalimApiClient } from '@masalim/api-client';
import * as Application from 'expo-application';
import { useUpdateGate } from '../stores/update-gate';
import { sessionEvents } from './session-events';
import { secureTokenStore } from './token-store';

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export const api = new MasalimApiClient({
  baseUrl,
  tokenStore: secureTokenStore,
  appVersion: Application.nativeApplicationVersion ?? '0.1.0',
  // The auth store listens (src/stores/auth.ts) — no direct store import here,
  // the store itself imports this client for sign-out.
  onSessionExpired: () => {
    sessionEvents.emitExpired();
  },
  onUpdateRequired: ({ minSupportedVersion }) => {
    useUpdateGate.getState().require(minSupportedVersion);
  },
});
