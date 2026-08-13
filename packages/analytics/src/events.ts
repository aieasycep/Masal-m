/**
 * Central analytics event registry (§49). Event names are the only place
 * they are defined — clients and backend both import from here.
 */
export const AnalyticsEvent = {
  ONBOARDING_COMPLETED: 'onboarding_completed',
  SIGN_UP: 'sign_up',
  LOGIN: 'login',
  CHILD_CREATED: 'child_created',
  STORY_WIZARD_STARTED: 'story_creation_started',
  STORY_WIZARD_STEP_COMPLETED: 'story_wizard_step_completed',
  STORY_GENERATED: 'story_generated',
  STORY_GENERATION_FAILED: 'story_generation_failed',
  STORY_LISTENED: 'story_listened',
  STORY_FAVORITED: 'story_favorited',
  PLAYBACK_STARTED: 'playback_started',
  PLAYBACK_COMPLETED: 'playback_completed',
  VOICE_RECORDING_STARTED: 'voice_recording_started',
  VOICE_CONSENT_ACCEPTED: 'voice_consent_accepted',
  VOICE_CREATED: 'voice_created',
  VOICE_CREATION_FAILED: 'voice_creation_failed',
  NARRATION_CREATED: 'narration_created',
  ILLUSTRATION_GENERATION_STARTED: 'illustration_generation_started',
  BOOK_CREATED: 'book_created',
  CHECKOUT_STARTED: 'checkout_started',
  PURCHASE_COMPLETED: 'purchase_completed',
  SUBSCRIPTION_STARTED: 'subscription_started',
  PAYWALL_VIEWED: 'paywall_viewed',
  ERROR_SHOWN: 'error_shown',
} as const;
export type AnalyticsEvent = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

export type AnalyticsProperties = Record<string, string | number | boolean>;

export interface AnalyticsProvider {
  track(event: AnalyticsEvent, properties?: AnalyticsProperties): void;
  identify(userId: string, traits?: AnalyticsProperties): void;
  reset(): void;
}

/** No-op provider — default until a real provider (PostHog, Firebase, …) is configured. */
export class NoopAnalyticsProvider implements AnalyticsProvider {
  track(): void {}
  identify(): void {}
  reset(): void {}
}
