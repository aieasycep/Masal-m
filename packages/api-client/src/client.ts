import type {
  AnalyticsBatchInput,
  AppConfig,
  AppleAuthInput,
  AuthSession,
  AuthTokens,
  Child,
  CreateChildInput,
  DeleteAccountInput,
  ForgotPasswordInput,
  GoogleAuthInput,
  LoginInput,
  Me,
  Recommendation,
  RegisterInput,
  RegisterDeviceInput,
  ResetPasswordInput,
  UpdateChildInput,
  UpdateMeInput,
} from '@masalim/validation';
import { HttpClient, type HttpClientConfig, type RequestOptions } from './http';

/**
 * Typed API client shared by mobile and admin. Endpoint groups are added as
 * the corresponding backend modules land; the surface mirrors docs/architecture.
 */
export class MasalimApiClient {
  readonly http: HttpClient;

  constructor(config: HttpClientConfig) {
    this.http = new HttpClient(config);
  }

  readonly auth = {
    register: (input: RegisterInput) =>
      this.http.post<AuthSession>('/auth/register', input, { anonymous: true }),
    login: (input: LoginInput) =>
      this.http.post<AuthSession>('/auth/login', input, { anonymous: true }),
    apple: (input: AppleAuthInput) =>
      this.http.post<AuthSession>('/auth/apple', input, { anonymous: true }),
    google: (input: GoogleAuthInput) =>
      this.http.post<AuthSession>('/auth/google', input, { anonymous: true }),
    refresh: (refreshToken: string) =>
      this.http.post<AuthTokens>('/auth/refresh', { refreshToken }, { anonymous: true }),
    logout: (refreshToken?: string) => this.http.post<void>('/auth/logout', { refreshToken }),
    forgotPassword: (input: ForgotPasswordInput) =>
      this.http.post<{ sent: boolean }>('/auth/password/forgot', input, { anonymous: true }),
    resetPassword: (input: ResetPasswordInput) =>
      this.http.post<{ reset: boolean }>('/auth/password/reset', input, { anonymous: true }),
  };

  readonly users = {
    me: () => this.http.get<Me>('/users/me'),
    updateMe: (input: UpdateMeInput) => this.http.patch<Me>('/users/me', input),
    requestDeletion: (input: DeleteAccountInput) => this.http.delete<Me>('/users/me', input),
    cancelDeletion: () => this.http.post<Me>('/users/me/deletion/cancel'),
  };

  readonly children = {
    list: () => this.http.get<Child[]>('/children'),
    get: (id: string) => this.http.get<Child>(`/children/${id}`),
    create: (input: CreateChildInput) => this.http.post<Child>('/children', input),
    update: (id: string, input: UpdateChildInput) =>
      this.http.patch<Child>(`/children/${id}`, input),
    remove: (id: string) => this.http.delete<void>(`/children/${id}`),
    recommendations: (id: string) =>
      this.http.get<Recommendation[]>(`/children/${id}/recommendations`),
  };

  readonly devices = {
    register: (input: RegisterDeviceInput) => this.http.post<void>('/devices', input),
    remove: (expoPushToken: string) => this.http.delete<void>('/devices', { expoPushToken }),
  };

  readonly analytics = {
    track: (input: AnalyticsBatchInput) => this.http.post<void>('/analytics/events', input),
  };

  readonly app = {
    config: () => this.http.get<AppConfig>('/app/config', { anonymous: true }),
  };

  /** Escape hatch for endpoints not yet wrapped in a typed group. */
  request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    switch (method) {
      case 'GET':
        return this.http.get<T>(path, options);
      case 'POST':
        return this.http.post<T>(path, body, options);
      case 'PATCH':
        return this.http.patch<T>(path, body, options);
      case 'PUT':
        return this.http.put<T>(path, body, options);
      case 'DELETE':
        return this.http.delete<T>(path, body, options);
    }
  }
}
