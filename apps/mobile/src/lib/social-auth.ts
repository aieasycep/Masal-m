import * as AppleAuthentication from 'expo-apple-authentication';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import type { AuthSession } from '@masalim/validation';
import { api } from './api';

/**
 * Thrown when the user dismisses the provider's sign-in sheet.
 * The UI treats it as a no-op (no error message shown).
 */
export class SocialAuthCancelled extends Error {
  constructor() {
    super('Social sign-in cancelled by user');
    this.name = 'SocialAuthCancelled';
  }
}

function isAppleCancellation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err != null &&
    'code' in err &&
    (err as { code: unknown }).code === 'ERR_REQUEST_CANCELED'
  );
}

/**
 * Sign in with Apple → exchanges the identity token with the backend.
 * Replay protection: the server issues a single-use nonce, Apple receives its
 * SHA-256 hex (and embeds it in the identity token), and the backend gets the
 * RAW nonce back to re-derive and compare. Apple only returns the full name on
 * the FIRST authorization, so it is forwarded once when present.
 */
export async function signInWithApple(): Promise<AuthSession> {
  const { nonce } = await api.auth.appleNonce();
  const hashedNonce = bytesToHex(sha256(utf8ToBytes(nonce)));

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (err) {
    if (isAppleCancellation(err)) throw new SocialAuthCancelled();
    throw err;
  }

  const { identityToken, fullName } = credential;
  if (identityToken == null) {
    throw new Error('Apple sign-in returned no identity token');
  }

  const formattedName = fullName != null ? AppleAuthentication.formatFullName(fullName).trim() : '';

  return api.auth.apple({
    identityToken,
    nonce,
    ...(formattedName.length > 0 ? { fullName: formattedName } : {}),
  });
}

let googleConfigured = false;

function ensureGoogleConfigured(): void {
  if (googleConfigured) return;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  });
  googleConfigured = true;
}

/** Sign in with Google → exchanges the ID token with the backend. */
export async function signInWithGoogle(): Promise<AuthSession> {
  ensureGoogleConfigured();

  let response: Awaited<ReturnType<typeof GoogleSignin.signIn>>;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    response = await GoogleSignin.signIn();
  } catch (err) {
    if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new SocialAuthCancelled();
    }
    throw err;
  }

  if (response.type === 'cancelled') {
    throw new SocialAuthCancelled();
  }

  const idToken = response.data.idToken;
  if (idToken == null) {
    throw new Error('Google sign-in returned no ID token');
  }

  return api.auth.google({ idToken });
}
