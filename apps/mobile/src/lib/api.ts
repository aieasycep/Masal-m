import { MasalimApiClient } from '@masalim/api-client';
import * as Application from 'expo-application';
import { useAuthStore } from '../stores/auth';
import { secureTokenStore } from './token-store';

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export const api = new MasalimApiClient({
  baseUrl,
  tokenStore: secureTokenStore,
  appVersion: Application.nativeApplicationVersion ?? '0.1.0',
  onSessionExpired: () => {
    useAuthStore.getState().clearSession();
  },
});
