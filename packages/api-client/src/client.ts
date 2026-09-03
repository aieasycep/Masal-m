import type {
  Address,
  AIJob,
  AnalyticsBatchInput,
  AppConfig,
  AppleAuthInput,
  AuthSession,
  AuthTokens,
  AvatarUploadInput,
  Book,
  CreateAddressInput,
  CreateOrderInput,
  InitPaymentResponse,
  Order,
  OrderConfiguration,
  OrderQuote,
  UpdateAddressInput,
  SignedUploadResponse,
  VoiceRecordingUploadInput,
  Child,
  CreateBookInput,
  CreateChildInput,
  CreateIllustrationSetInput,
  CreateNarrationInput,
  CreateStoryInput,
  CreateVoiceProfileInput,
  DeleteAccountInput,
  Illustration,
  IllustrationSet,
  RenderBookInput,
  UpdateBookInput,
  EntitlementsResponse,
  ForgotPasswordInput,
  GoogleAuthInput,
  ListStoriesQuery,
  LoginInput,
  Me,
  MockPurchaseInput,
  OfferingsResponse,
  Narration,
  NotificationItem,
  PaginatedMeta,
  PlaybackPositionInput,
  Recommendation,
  RecreateVoiceProfileInput,
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
  UpdateVoiceProfileInput,
  VoiceProfile,
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
    recommendations: (id: string, limit?: number) =>
      this.http.get<Recommendation[]>(
        `/children/${id}/recommendations${limit != null ? `?limit=${limit}` : ''}`,
      ),
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
    list: () => this.http.get<VoiceProfile[]>('/voices'),
    create: (input: CreateVoiceProfileInput) => this.http.post<VoiceProfile>('/voices', input),
    rename: (id: string, input: UpdateVoiceProfileInput) =>
      this.http.patch<VoiceProfile>(`/voices/${id}`, input),
    remove: (id: string) => this.http.delete<void>(`/voices/${id}`),
    preview: (id: string) => this.http.post<{ previewUrl: string }>(`/voices/${id}/preview`),
    recreate: (id: string, input: RecreateVoiceProfileInput) =>
      this.http.post<VoiceProfile>(`/voices/${id}/recreate`, input),
  };

  readonly illustrations = {
    list: (storyId: string) =>
      this.http.get<IllustrationSet[]>(`/stories/${storyId}/illustrations`),
    create: (storyId: string, input: CreateIllustrationSetInput) =>
      this.http.post<{ set: IllustrationSet; jobId: string | null }>(
        `/stories/${storyId}/illustrations`,
        input,
      ),
    select: (illustrationId: string) =>
      this.http.patch<Illustration>(`/illustrations/${illustrationId}`, { selected: true }),
    regenerate: (illustrationId: string) =>
      this.http.post<{ jobId: string }>(`/illustrations/${illustrationId}/regenerate`),
  };

  readonly books = {
    list: () => this.http.get<Book[]>('/books'),
    create: (input: CreateBookInput) => this.http.post<Book>('/books', input),
    get: (id: string) => this.http.get<Book>(`/books/${id}`),
    update: (id: string, input: UpdateBookInput) => this.http.patch<Book>(`/books/${id}`, input),
    remove: (id: string) => this.http.delete<void>(`/books/${id}`),
    render: (id: string, input: RenderBookInput) =>
      this.http.post<{ jobId: string }>(`/books/${id}/render`, input),
  };

  readonly narrations = {
    list: (storyId: string) => this.http.get<Narration[]>(`/stories/${storyId}/narrations`),
    create: (storyId: string, input: CreateNarrationInput) =>
      this.http.post<{ narration: Narration; jobId: string | null }>(
        `/stories/${storyId}/narrations`,
        input,
      ),
  };

  readonly subscription = {
    get: () => this.http.get<Subscription>('/subscription'),
    entitlements: () => this.http.get<EntitlementsResponse>('/subscription/entitlements'),
    /** Paywall products for this user — server-config prices, plan-matched packs. */
    offerings: () => this.http.get<OfferingsResponse>('/subscription/offerings'),
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

  readonly addresses = {
    list: () => this.http.get<Address[]>('/addresses'),
    create: (input: CreateAddressInput) => this.http.post<Address>('/addresses', input),
    update: (id: string, input: UpdateAddressInput) =>
      this.http.patch<Address>(`/addresses/${id}`, input),
    remove: (id: string) => this.http.delete<void>(`/addresses/${id}`),
  };

  readonly orders = {
    quote: (input: OrderConfiguration) => this.http.post<OrderQuote>('/orders/quote', input),
    list: () => this.http.get<Order[]>('/orders'),
    /** Requires an Idempotency-Key so a double tap creates exactly one order (§78). */
    create: (input: CreateOrderInput, idempotencyKey: string) =>
      this.http.post<Order>('/orders', input, { idempotencyKey }),
    get: (id: string) => this.http.get<Order>(`/orders/${id}`),
    cancel: (id: string) => this.http.post<Order>(`/orders/${id}/cancel`),
    initPayment: (id: string, idempotencyKey: string) =>
      this.http.post<InitPaymentResponse>(`/orders/${id}/payment`, undefined, {
        idempotencyKey,
      }),
    /** Dev-only mock payment completion — rejected outside mock mode. */
    mockCompletePayment: (providerToken: string) =>
      this.http.post<{ status: string; orderId: string }>('/payments/mock/complete', {
        providerToken,
      }),
  };

  readonly uploads = {
    voiceRecording: (input: VoiceRecordingUploadInput) =>
      this.http.post<SignedUploadResponse>('/uploads/voice-recordings', input),
    avatar: (input: AvatarUploadInput) =>
      this.http.post<SignedUploadResponse>('/uploads/avatars', input),
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
