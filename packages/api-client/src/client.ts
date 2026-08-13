import type {
  AIJob,
  AnalyticsBatchInput,
  AppConfig,
  AppleAuthInput,
  AuthSession,
  AuthTokens,
  Child,
  CreateChildInput,
  CreateStoryInput,
  DeleteAccountInput,
  EntitlementsResponse,
  ForgotPasswordInput,
  GoogleAuthInput,
  ListStoriesQuery,
  LoginInput,
  Me,
  MockPurchaseInput,
  NotificationItem,
  PaginatedMeta,
  PlaybackPositionInput,
  Recommendation,
  RegisterInput,
  RegisterDeviceInput,
  ResetPasswordInput,
  StoryDetail,
  StorySummary,
  Subscription,
  SystemVoice,
  UpdateChildInput,
  UpdateMeInput,
  UpdateStoryInput,
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

  readonly stories = {
    list: (query: Partial<ListStoriesQuery> = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value != null && value !== '') params.set(key, String(value));
      }
      const qs = params.toString();
      return this.http.get<{ items: StorySummary[]; meta: PaginatedMeta }>(
        `/stories${qs ? `?${qs}` : ''}`,
      );
    },
    create: (input: CreateStoryInput) => this.http.post<StoryDetail>('/stories', input),
    detail: (id: string) => this.http.get<StoryDetail>(`/stories/${id}`),
    update: (id: string, input: UpdateStoryInput) =>
      this.http.patch<StoryDetail>(`/stories/${id}`, input),
    remove: (id: string) => this.http.delete<void>(`/stories/${id}`),
    generate: (id: string) => this.http.post<{ jobId: string }>(`/stories/${id}/generate`),
    duplicate: (id: string) => this.http.post<StoryDetail>(`/stories/${id}/duplicate`),
    favorite: (id: string) => this.http.put<void>(`/stories/${id}/favorite`),
    unfavorite: (id: string) => this.http.delete<void>(`/stories/${id}/favorite`),
    setPlaybackPosition: (id: string, input: PlaybackPositionInput) =>
      this.http.put<void>(`/stories/${id}/playback-position`, input),
  };

  readonly jobs = {
    get: (id: string) => this.http.get<AIJob>(`/jobs/${id}`),
    /** SSE endpoint URL — consumed by react-native-sse with an Authorization header. */
    streamUrl: (id: string) => `${this.http.baseUrl}/jobs/${id}/stream`,
  };

  readonly voices = {
    system: () => this.http.get<SystemVoice[]>('/voices/system'),
    systemPreview: (id: string) =>
      this.http.post<{ previewUrl: string }>(`/voices/system/${id}/preview`),
  };

  readonly subscription = {
    get: () => this.http.get<Subscription>('/subscription'),
    entitlements: () => this.http.get<EntitlementsResponse>('/subscription/entitlements'),
    /** Dev-only mock IAP — rejected by the API outside mock mode. */
    mockPurchase: (input: MockPurchaseInput) =>
      this.http.post<Subscription>('/subscription/mock/purchase', input),
    mockExpire: () => this.http.post<Subscription>('/subscription/mock/expire'),
  };

  readonly notifications = {
    list: (page = 1) =>
      this.http.get<{ items: NotificationItem[]; meta: PaginatedMeta }>(
        `/notifications?page=${page}`,
      ),
    markRead: (id: string) => this.http.post<NotificationItem>(`/notifications/${id}/read`),
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
