import type {
  AdminAuditLog,
  AdminDashboardStats,
  AdminJob,
  AdminModerationPatchInput,
  AdminOrderPatchInput,
  AdminSession,
  AdminStory,
  AdminSystemVoiceUpsertInput,
  AdminUserDetail,
  AdminUserSummary,
  PaginatedMeta,
} from '@masalim/validation';
import type { PaymentStatus, SystemVoiceCategory } from '@masalim/types';
import { clearSession, getToken } from './auth';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * The API's app-version middleware gates every route except app/config+health,
 * so the admin panel always sends a version far above any minimum.
 */
const APP_VERSION_HEADER = '999.0.0';

export interface Paginated<T> {
  items: T[];
  meta: PaginatedMeta;
}

/** Order list row — response shape of GET /admin/orders (no wire schema in @masalim/validation). */
export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  userEmail: string;
  bookTitle: string;
  quantity: number;
  total: string;
  status: string;
  paymentStatus: PaymentStatus;
  trackingNumber: string | null;
  createdAt: string;
}

/** SystemVoice row as returned by GET /admin/system-voices (Prisma model, minus internals we ignore). */
export interface AdminSystemVoice {
  id: string;
  displayName: string;
  description: string;
  category: SystemVoiceCategory;
  provider: string;
  providerVoiceId: string;
  previewKey: string | null;
  enabled: boolean;
  premiumOnly: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminFeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
  isPublic: boolean;
  payload: Record<string, unknown>;
  updatedAt: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Beklenmeyen bir hata oluştu';
}

type Query = Record<string, string | number | undefined>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Login must not bounce back to /login on a 401 (wrong password). */
  skipAuthRedirect?: boolean;
}

function buildUrl(path: string, query?: Query): string {
  const url = `${BASE_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs.length > 0 ? `${url}?${qs}` : url;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'x-app-version': APP_VERSION_HEADER,
  };
  const token = getToken();
  if (token != null) headers['Authorization'] = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError('Sunucuya ulaşılamadı. API çalışıyor mu?', 'NETWORK_ERROR', 0);
  }

  if (response.status === 401 && !options.skipAuthRedirect) {
    clearSession();
    if (typeof window !== 'undefined') window.location.assign('/login');
    throw new ApiError('Oturum süresi doldu', 'UNAUTHORIZED', 401);
  }

  if (!response.ok) {
    let code = 'UNKNOWN';
    let message = `İstek başarısız oldu (${response.status})`;
    let requestId: string | undefined;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string; requestId?: string };
      };
      if (body.error != null) {
        code = body.error.code ?? code;
        message = body.error.message ?? message;
        requestId = body.error.requestId;
      }
    } catch {
      // non-JSON error body — keep the fallback message
    }
    throw new ApiError(message, code, response.status, requestId);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  // ── Auth ──
  login: (email: string, password: string) =>
    request<AdminSession>('/admin/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuthRedirect: true,
    }),

  // ── Dashboard ──
  dashboardStats: () => request<AdminDashboardStats>('/admin/dashboard/stats'),

  // ── Users ──
  listUsers: (query: { page: number; pageSize: number; search?: string }) =>
    request<Paginated<AdminUserSummary>>('/admin/users', { query }),
  userDetail: (id: string) => request<AdminUserDetail>(`/admin/users/${id}`),

  // ── Jobs ──
  listJobs: (query: { page: number; pageSize: number; status?: string; type?: string }) =>
    request<Paginated<AdminJob>>('/admin/jobs', { query }),
  retryJob: (id: string) => request<AdminJob>(`/admin/jobs/${id}/retry`, { method: 'POST' }),

  // ── Stories ──
  listStories: (query: {
    page: number;
    pageSize: number;
    status?: string;
    moderationStatus?: string;
    search?: string;
  }) => request<Paginated<AdminStory>>('/admin/stories', { query }),
  patchModeration: (id: string, body: AdminModerationPatchInput) =>
    request<AdminStory>(`/admin/stories/${id}/moderation`, { method: 'PATCH', body }),

  // ── Orders ──
  listOrders: (query: { page: number; pageSize: number; status?: string; search?: string }) =>
    request<Paginated<AdminOrderRow>>('/admin/orders', { query }),
  patchOrder: (id: string, body: AdminOrderPatchInput) =>
    request<{ id: string }>(`/admin/orders/${id}`, { method: 'PATCH', body }),

  // ── System voices ──
  listSystemVoices: () => request<AdminSystemVoice[]>('/admin/system-voices'),
  createSystemVoice: (body: AdminSystemVoiceUpsertInput) =>
    request<AdminSystemVoice>('/admin/system-voices', { method: 'POST', body }),
  updateSystemVoice: (id: string, body: Partial<AdminSystemVoiceUpsertInput>) =>
    request<AdminSystemVoice>(`/admin/system-voices/${id}`, { method: 'PATCH', body }),

  // ── Feature flags ──
  listFeatureFlags: () => request<AdminFeatureFlag[]>('/admin/feature-flags'),
  patchFeatureFlag: (key: string, enabled: boolean) =>
    request<AdminFeatureFlag>(`/admin/feature-flags/${key}`, {
      method: 'PATCH',
      body: { enabled },
    }),

  // ── Audit logs ──
  listAuditLogs: (query: { page: number; pageSize: number }) =>
    request<Paginated<AdminAuditLog>>('/admin/audit-logs', { query }),
};
