import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@masalim/types';
import type { AuthTokens } from '@masalim/validation';
import { ApiError, HttpClient, NetworkError, TransientError, type TokenStore } from '../http';

const INITIAL: AuthTokens = {
  accessToken: 'access-old',
  refreshToken: 'refresh-old-token',
  accessTokenExpiresAt: 1,
};
const ROTATED: AuthTokens = {
  accessToken: 'access-new',
  refreshToken: 'refresh-new-token',
  accessTokenExpiresAt: 2,
};

function memoryStore(
  initial: AuthTokens | null = INITIAL,
): TokenStore & { current: () => AuthTokens | null } {
  let tokens = initial;
  return {
    getTokens: async () => tokens,
    setTokens: async (next) => {
      tokens = next;
    },
    current: () => tokens,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, code: ErrorCode, details?: unknown): Response {
  return jsonResponse(status, { error: { code, message: code, ...(details ? { details } : {}) } });
}

interface Call {
  url: string;
  init: RequestInit;
}

/** Scripted fetch: each call pops the next responder; records every call. */
function scriptedFetch(responders: Array<(call: Call) => Response | Promise<Response>>) {
  const calls: Call[] = [];
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    const responder = responders.shift();
    if (responder == null) throw new Error(`unexpected fetch #${calls.length}: ${call.url}`);
    return responder(call);
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

function headerOf(call: Call, name: string): string | undefined {
  return (call.init.headers as Record<string, string> | undefined)?.[name];
}

describe('HttpClient refresh flow', () => {
  it('expired access token → refresh ok → retried request succeeds with the new token', async () => {
    const store = memoryStore();
    const onSessionExpired = vi.fn();
    const { fetchFn, calls } = scriptedFetch([
      () => errorResponse(401, ErrorCode.AUTH_TOKEN_EXPIRED),
      () => jsonResponse(200, ROTATED),
      () => jsonResponse(200, { ok: true }),
    ]);
    const client = new HttpClient({
      baseUrl: 'https://api.test/',
      tokenStore: store,
      appVersion: '1.2.3',
      fetchFn,
      onSessionExpired,
    });

    await expect(client.get<{ ok: boolean }>('/users/me')).resolves.toEqual({ ok: true });

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.test/users/me',
      'https://api.test/auth/refresh',
      'https://api.test/users/me',
    ]);
    expect(headerOf(calls[0]!, 'Authorization')).toBe('Bearer access-old');
    // The refresh call carries the version gate header and the stored refresh token.
    expect(headerOf(calls[1]!, 'x-app-version')).toBe('1.2.3');
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ refreshToken: 'refresh-old-token' });
    expect(headerOf(calls[2]!, 'Authorization')).toBe('Bearer access-new');
    expect(store.current()).toEqual(ROTATED);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('refresh rejected (401) → tokens cleared, onSessionExpired, original ApiError thrown', async () => {
    const store = memoryStore();
    const onSessionExpired = vi.fn();
    const { fetchFn, calls } = scriptedFetch([
      () => errorResponse(401, ErrorCode.AUTH_TOKEN_EXPIRED),
      () => errorResponse(401, ErrorCode.AUTH_TOKEN_INVALID),
    ]);
    const client = new HttpClient({
      baseUrl: 'https://api.test',
      tokenStore: store,
      fetchFn,
      onSessionExpired,
    });

    const error = await client.get('/stories').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(NetworkError);
    expect((error as ApiError).code).toBe(ErrorCode.AUTH_TOKEN_EXPIRED);
    expect((error as ApiError).status).toBe(401);
    expect(store.current()).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2); // no retry of the original request
  });

  it('refresh rate-limited (429) → tokens kept, TransientError (a NetworkError) thrown', async () => {
    const store = memoryStore();
    const onSessionExpired = vi.fn();
    const { fetchFn } = scriptedFetch([
      () => errorResponse(401, ErrorCode.AUTH_TOKEN_EXPIRED),
      () => errorResponse(429, ErrorCode.RATE_LIMITED),
    ]);
    const client = new HttpClient({
      baseUrl: 'https://api.test',
      tokenStore: store,
      fetchFn,
      onSessionExpired,
    });

    const error = await client.get('/stories').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(TransientError);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as TransientError).status).toBe(429);
    expect((error as TransientError).code).toBe(ErrorCode.RATE_LIMITED);
    expect(store.current()).toEqual(INITIAL);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('refresh network throw → tokens kept, TransientError with status 0', async () => {
    const store = memoryStore();
    const onSessionExpired = vi.fn();
    const { fetchFn } = scriptedFetch([
      () => errorResponse(401, ErrorCode.AUTH_TOKEN_EXPIRED),
      () => {
        throw new TypeError('Network request failed');
      },
    ]);
    const client = new HttpClient({
      baseUrl: 'https://api.test',
      tokenStore: store,
      fetchFn,
      onSessionExpired,
    });

    const error = await client.get('/stories').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(TransientError);
    expect((error as TransientError).status).toBe(0);
    // Falls back to the original request's code when the refresh produced none.
    expect((error as TransientError).code).toBe(ErrorCode.AUTH_TOKEN_EXPIRED);
    expect(store.current()).toEqual(INITIAL);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('426 on a normal request → onUpdateRequired (throttled) + ApiError, no refresh attempt', async () => {
    const store = memoryStore();
    const onUpdateRequired = vi.fn();
    const { fetchFn, calls } = scriptedFetch([
      () => errorResponse(426, ErrorCode.APP_VERSION_UNSUPPORTED, { minSupportedVersion: '2.0.0' }),
      () => errorResponse(426, ErrorCode.APP_VERSION_UNSUPPORTED),
    ]);
    const client = new HttpClient({
      baseUrl: 'https://api.test',
      tokenStore: store,
      fetchFn,
      onUpdateRequired,
    });

    const first = await client.get('/stories').catch((err: unknown) => err);
    expect(first).toBeInstanceOf(ApiError);
    expect((first as ApiError).code).toBe(ErrorCode.APP_VERSION_UNSUPPORTED);
    expect((first as ApiError).status).toBe(426);
    expect(onUpdateRequired).toHaveBeenCalledTimes(1);
    expect(onUpdateRequired).toHaveBeenCalledWith({ minSupportedVersion: '2.0.0' });

    // A second 426 inside the 30 s window still throws but does not re-notify.
    const second = await client.get('/stories').catch((err: unknown) => err);
    expect(second).toBeInstanceOf(ApiError);
    expect(onUpdateRequired).toHaveBeenCalledTimes(1);
    expect(calls.every((call) => !call.url.endsWith('/auth/refresh'))).toBe(true);
    expect(store.current()).toEqual(INITIAL);
  });

  it('426 during refresh → onUpdateRequired, tokens kept, original ApiError', async () => {
    const store = memoryStore();
    const onUpdateRequired = vi.fn();
    const onSessionExpired = vi.fn();
    const { fetchFn } = scriptedFetch([
      () => errorResponse(401, ErrorCode.AUTH_TOKEN_EXPIRED),
      () => errorResponse(426, ErrorCode.APP_VERSION_UNSUPPORTED),
    ]);
    const client = new HttpClient({
      baseUrl: 'https://api.test',
      tokenStore: store,
      fetchFn,
      onUpdateRequired,
      onSessionExpired,
    });

    const error = await client.get('/stories').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(ErrorCode.AUTH_TOKEN_EXPIRED);
    expect(onUpdateRequired).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(store.current()).toEqual(INITIAL);
  });

  it('AUTH_TOKEN_INVALID also triggers one refresh attempt (JWT secret rotation)', async () => {
    const store = memoryStore();
    const { fetchFn, calls } = scriptedFetch([
      () => errorResponse(401, ErrorCode.AUTH_TOKEN_INVALID),
      () => jsonResponse(200, ROTATED),
      () => jsonResponse(200, { id: 'u1' }),
    ]);
    const client = new HttpClient({ baseUrl: 'https://api.test', tokenStore: store, fetchFn });

    await expect(client.get<{ id: string }>('/users/me')).resolves.toEqual({ id: 'u1' });
    expect(calls[1]!.url).toBe('https://api.test/auth/refresh');
    expect(headerOf(calls[2]!, 'Authorization')).toBe('Bearer access-new');
    expect(store.current()).toEqual(ROTATED);
  });

  it('never refreshes anonymous requests or retries more than once', async () => {
    const store = memoryStore();
    const { fetchFn, calls } = scriptedFetch([
      () => errorResponse(401, ErrorCode.AUTH_TOKEN_EXPIRED),
      // Second scenario: the retried request is still 401 → no second refresh.
      () => errorResponse(401, ErrorCode.AUTH_TOKEN_EXPIRED),
      () => jsonResponse(200, ROTATED),
      () => errorResponse(401, ErrorCode.AUTH_TOKEN_EXPIRED),
    ]);
    const client = new HttpClient({ baseUrl: 'https://api.test', tokenStore: store, fetchFn });

    const anonymous = await client
      .post('/auth/login', {}, { anonymous: true })
      .catch((err: unknown) => err);
    expect(anonymous).toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);

    const stillExpired = await client.get('/stories').catch((err: unknown) => err);
    expect(stillExpired).toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(4);
  });

  it('concurrent 401s share a single refresh call', async () => {
    const store = memoryStore();
    const { fetchFn, calls } = scriptedFetch([
      () => errorResponse(401, ErrorCode.AUTH_TOKEN_EXPIRED),
      () => errorResponse(401, ErrorCode.AUTH_TOKEN_EXPIRED),
      () => jsonResponse(200, ROTATED),
      () => jsonResponse(200, { a: 1 }),
      () => jsonResponse(200, { b: 2 }),
    ]);
    const client = new HttpClient({ baseUrl: 'https://api.test', tokenStore: store, fetchFn });

    const [a, b] = await Promise.all([client.get('/a'), client.get('/b')]);
    expect(a).toEqual({ a: 1 });
    expect(b).toEqual({ b: 2 });
    expect(calls.filter((call) => call.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('no stored session on a 401 → signed out without a refresh call', async () => {
    const store = memoryStore(null);
    const onSessionExpired = vi.fn();
    const { fetchFn, calls } = scriptedFetch([
      () => errorResponse(401, ErrorCode.AUTH_TOKEN_INVALID),
    ]);
    const client = new HttpClient({
      baseUrl: 'https://api.test',
      tokenStore: store,
      fetchFn,
      onSessionExpired,
    });

    const error = await client.get('/users/me').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
  });
});
