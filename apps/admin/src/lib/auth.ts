import type { AdminSession } from '@masalim/validation';

export type AdminInfo = AdminSession['admin'];

/**
 * Residual risk: the admin bearer token lives in localStorage, so any script that is allowed to
 * run on this origin can read it. The nonce-based CSP (src/middleware.ts) shrinks that set to
 * Next's own bundles — an injected inline script or a foreign origin gets no nonce — but it is a
 * mitigation, not isolation. Moving the admin realm to an httpOnly, SameSite cookie (API-issued,
 * cleared on logout) is the follow-up that removes the exposure entirely.
 */
const TOKEN_KEY = 'masalim.admin.token';
const ADMIN_KEY = 'masalim.admin.info';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getAdmin(): AdminInfo | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(ADMIN_KEY);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as AdminInfo;
  } catch {
    return null;
  }
}

export function storeSession(session: AdminSession): void {
  window.localStorage.setItem(TOKEN_KEY, session.accessToken);
  window.localStorage.setItem(ADMIN_KEY, JSON.stringify(session.admin));
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(ADMIN_KEY);
}
