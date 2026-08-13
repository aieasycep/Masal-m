import type { AdminSession } from '@masalim/validation';

export type AdminInfo = AdminSession['admin'];

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
