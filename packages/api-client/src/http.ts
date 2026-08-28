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

export interface TokenStore {
  getTokens(): Promise<AuthTokens | null>;
  setTokens(tokens: AuthTokens | null): Promise<void>;
}

export interface HttpClientConfig {
  baseUrl: string;
  tokenStore?: TokenStore;
  /** App version sent as x-app-version for the API version gate. */
  appVersion?: string;
  /** Called when a refresh attempt fails — the app should sign the user out. */
  onSessionExpired?: () => void;
  fetchFn?: typeof fetch;
}

export interface RequestOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Skip the Authorization header (public endpoints). */
  anonymous?: boolean;
}

/**
 * Minimal typed HTTP client shared by mobile and admin. Handles auth headers,
 * one-flight refresh-token rotation on 401, the standard error envelope, and
 * idempotency keys.
 */
export class HttpClient {
  private refreshInFlight: Promise<AuthTokens | null> | null = null;

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

    // One transparent refresh+retry on an expired access token.
    if (
      response.status === 401 &&
      errorBody.error.code === ErrorCode.AUTH_TOKEN_EXPIRED &&
      !options?.anonymous &&
      !isRetryAfterRefresh &&
      this.config.tokenStore
    ) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        return this.request<T>(method, path, body, options, true);
      }
    }

    throw new ApiError(
      errorBody.error.code,
      errorBody.error.message,
      response.status,
      errorBody.error.requestId,
      errorBody.error.details,
    );
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
  private async refreshTokens(): Promise<AuthTokens | null> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<AuthTokens | null> {
    const store = this.config.tokenStore;
    if (!store) return null;
    const current = await store.getTokens();
    if (!current?.refreshToken) return null;

    const fetchFn = this.config.fetchFn ?? fetch;
    try {
      const response = await fetchFn(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!response.ok) {
        await store.setTokens(null);
        this.config.onSessionExpired?.();
        return null;
      }
      const tokens = (await response.json()) as AuthTokens;
      await store.setTokens(tokens);
      return tokens;
    } catch {
      // Network failure during refresh: keep tokens, let the caller retry later.
      return null;
    }
  }
}
