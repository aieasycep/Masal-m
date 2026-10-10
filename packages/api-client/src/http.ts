import { ErrorCode, type ApiErrorBody } from '@masalim/types';
import type { AuthTokens } from '@masalim/validation';

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends Error {
  constructor(override readonly cause?: unknown) {
    super('Network request failed');
    this.name = 'NetworkError';
  }
}

/**
 * The access token expired (or was rejected) and the refresh call failed for a
 * reason that is NOT the session's fault — rate limit, server error, network
 * drop. Tokens are kept; the caller should simply retry later. It is a
 * NetworkError so query/mutation retry policies treat it as a blip.
 * `status` is the refresh response status (0 when the fetch itself threw).
 */
export class TransientError extends NetworkError {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    cause?: unknown,
  ) {
    super(cause);
    this.name = 'TransientError';
    this.message =
      status > 0
        ? `Token refresh failed transiently (HTTP ${status})`
        : 'Network request failed during token refresh';
  }
}

export interface TokenStore {
  getTokens(): Promise<AuthTokens | null>;
  setTokens(tokens: AuthTokens | null): Promise<void>;
}

export interface UpdateRequiredInfo {
  /** Lowest app version the server still accepts, when the response said so. */
  minSupportedVersion: string | null;
}

export interface HttpClientConfig {
  baseUrl: string;
  tokenStore?: TokenStore;
  /** App version sent as x-app-version for the API version gate. */
  appVersion?: string;
  /** Called when the session is gone (refresh rejected) — the app should sign the user out. */
  onSessionExpired?: () => void;
  /**
   * Called (at most once per 30 s) whenever the server answers 426 /
   * APP_VERSION_UNSUPPORTED — the app should show its update-required gate.
   */
  onUpdateRequired?: (info: UpdateRequiredInfo) => void;
  fetchFn?: typeof fetch;
}

export interface RequestOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Skip the Authorization header (public endpoints). */
  anonymous?: boolean;
}

/** Outcome of one refresh-token rotation attempt. */
export type RefreshResult =
  | { kind: 'ok'; tokens: AuthTokens }
  /** The refresh token was rejected (401/403) or there is none — tokens cleared, `onSessionExpired` fired. */
  | { kind: 'signed_out' }
  /** 429 / 5xx / other failure / network throw — tokens kept, retry later. */
  | { kind: 'transient'; status: number; code: ErrorCode | null }
  /** 426 — tokens kept, `onUpdateRequired` fired. */
  | { kind: 'update_required' };

/** Minimum gap between two `onUpdateRequired` notifications. */
const UPDATE_REQUIRED_NOTIFY_INTERVAL_MS = 30_000;

/** Error codes that trigger one transparent refresh + retry. */
const REFRESHABLE_CODES: ReadonlySet<string> = new Set([
  ErrorCode.AUTH_TOKEN_EXPIRED,
  // A valid-looking token the server no longer accepts (e.g. JWT secret rotation):
  // opaque refresh tokens survive that, so one rotation attempt is worth it.
  ErrorCode.AUTH_TOKEN_INVALID,
]);

/**
 * Minimal typed HTTP client shared by mobile and admin. Handles auth headers,
 * one-flight refresh-token rotation on 401, the standard error envelope, the
 * version gate (426) and idempotency keys.
 */
export class HttpClient {
  private refreshInFlight: Promise<RefreshResult> | null = null;
  private lastUpdateRequiredAt = 0;

  constructor(private readonly config: HttpClientConfig) {}

  get baseUrl(): string {
    return this.config.baseUrl.replace(/\/$/, '');
  }

  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  async delete<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, body, options);
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    options?: RequestOptions,
    isRetryAfterRefresh = false,
  ): Promise<T> {
    const fetchFn = this.config.fetchFn ?? fetch;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.config.appVersion) headers['x-app-version'] = this.config.appVersion;
    if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    if (!options?.anonymous && this.config.tokenStore) {
      const tokens = await this.config.tokenStore.getTokens();
      if (tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;
    }

    let response: Response;
    try {
      response = await fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: options?.signal ?? null,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      throw new NetworkError(err);
    }

    if (response.status === 204) return undefined as T;

    if (response.ok) {
      return (await response.json()) as T;
    }

    const errorBody = await this.parseErrorBody(response);
    const apiError = new ApiError(
      errorBody.error.code,
      errorBody.error.message,
      response.status,
      errorBody.error.requestId,
      errorBody.error.details,
    );

    if (this.isUpdateRequired(response.status, errorBody)) {
      this.notifyUpdateRequired(errorBody);
      throw apiError;
    }

    // One transparent refresh+retry on an expired/rejected access token.
    if (
      response.status === 401 &&
      REFRESHABLE_CODES.has(errorBody.error.code) &&
      !options?.anonymous &&
      !isRetryAfterRefresh &&
      this.config.tokenStore
    ) {
      const result = await this.refreshTokens();
      switch (result.kind) {
        case 'ok':
          return this.request<T>(method, path, body, options, true);
        case 'transient':
          throw new TransientError(result.status, result.code ?? errorBody.error.code, apiError);
        case 'signed_out':
        case 'update_required':
          throw apiError;
      }
    }

    throw apiError;
  }

  private isUpdateRequired(status: number, errorBody: ApiErrorBody): boolean {
    return status === 426 || errorBody.error.code === ErrorCode.APP_VERSION_UNSUPPORTED;
  }

  private notifyUpdateRequired(errorBody: ApiErrorBody): void {
    const now = Date.now();
    if (now - this.lastUpdateRequiredAt < UPDATE_REQUIRED_NOTIFY_INTERVAL_MS) return;
    this.lastUpdateRequiredAt = now;
    const details = errorBody.error.details;
    const minSupportedVersion =
      typeof details === 'object' &&
      details != null &&
      'minSupportedVersion' in details &&
      typeof (details as { minSupportedVersion: unknown }).minSupportedVersion === 'string'
        ? (details as { minSupportedVersion: string }).minSupportedVersion
        : null;
    this.config.onUpdateRequired?.({ minSupportedVersion });
  }

  private async parseErrorBody(response: Response): Promise<ApiErrorBody> {
    try {
      const json = (await response.json()) as Partial<ApiErrorBody>;
      if (json?.error?.code) return json as ApiErrorBody;
    } catch {
      // fall through to generic
    }
    return {
      error: {
        code: response.status === 429 ? ErrorCode.RATE_LIMITED : ErrorCode.INTERNAL,
        message: `HTTP ${response.status}`,
      },
    };
  }

  /** Single-flight refresh: concurrent 401s share one rotation call. */
  private async refreshTokens(): Promise<RefreshResult> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async signOut(): Promise<RefreshResult> {
    await this.config.tokenStore?.setTokens(null);
    this.config.onSessionExpired?.();
    return { kind: 'signed_out' };
  }

  private async doRefresh(): Promise<RefreshResult> {
    const store = this.config.tokenStore;
    if (!store) return { kind: 'signed_out' };
    const current = await store.getTokens();
    // No refresh token to rotate: the session is gone, whatever the UI thinks.
    if (!current?.refreshToken) return this.signOut();

    const fetchFn = this.config.fetchFn ?? fetch;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.config.appVersion) headers['x-app-version'] = this.config.appVersion;

    let response: Response;
    try {
      response = await fetchFn(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
    } catch {
      // Network failure during refresh: keep tokens, let the caller retry later.
      return { kind: 'transient', status: 0, code: null };
    }

    if (response.ok) {
      try {
        const tokens = (await response.json()) as AuthTokens;
        await store.setTokens(tokens);
        return { kind: 'ok', tokens };
      } catch {
        return { kind: 'transient', status: response.status, code: ErrorCode.INTERNAL };
      }
    }

    const errorBody = await this.parseErrorBody(response);
    if (this.isUpdateRequired(response.status, errorBody)) {
      this.notifyUpdateRequired(errorBody);
      return { kind: 'update_required' };
    }
    if (response.status === 401 || response.status === 403) {
      return this.signOut();
    }
    // 429 / 5xx / anything else: the refresh token may well still be valid.
    return { kind: 'transient', status: response.status, code: errorBody.error.code };
  }
}
