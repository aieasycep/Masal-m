import { createHmac } from 'node:crypto';

/** Admin access tokens live 8 hours; there is no refresh flow for the panel. */
export const ADMIN_TOKEN_TTL = '8h';

/** Minimal claims: identity only — role and email are re-read from the DB on every request. */
export interface AdminTokenPayload {
  sub: string;
  type: 'admin';
}

/**
 * Admin tokens are signed with a key DERIVED from JWT_SECRET rather than the
 * secret itself, so a user access token can never verify in the admin realm
 * (and vice versa) even if a `type` check were ever bypassed. Both the login
 * signer and the guard must use this one helper.
 */
export function adminSigningSecret(jwtSecret: string): string {
  return createHmac('sha256', jwtSecret).update('masalim-admin-realm').digest('hex');
}
