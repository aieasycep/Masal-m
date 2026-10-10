import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import type { ImperativeRouter } from 'expo-router';
import { AnalyticsEvent } from '@masalim/analytics';
import { DevicePlatform } from '@masalim/types';
import { api } from './api';

/** Warn about a missing push token (no EAS projectId in dev) only once per launch. */
let warnedTokenUnavailable = false;
/** The missing-projectId condition is reported once per launch, not per call. */
let reportedMissingProjectId = false;

/** Push is a no-op on web and on simulators (no APNs/FCM there). */
function pushSupported(): boolean {
  return Platform.OS !== 'web' && Device.isDevice;
}

/** Foreground presentation: banner + sound, no badge count (design brief §push). */
export function configureNotificationHandler(): void {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * EAS project id the Expo push token is attributed to. Comes from
 * `app.json` → `extra.eas.projectId` (set by `eas init`) or the EAS build
 * manifest. Without it `getExpoPushTokenAsync` falls back to a legacy,
 * account-bound token that production builds must not rely on.
 */
function easProjectId(): string | null {
  const fromConfig: unknown = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof fromConfig === 'string' && fromConfig.length > 0) return fromConfig;
  const fromEas = Constants.easConfig?.projectId;
  return typeof fromEas === 'string' && fromEas.length > 0 ? fromEas : null;
}

/** Surface the misconfiguration once: loudly in dev, as an analytics event in release. */
function reportMissingProjectId(): void {
  if (reportedMissingProjectId) return;
  reportedMissingProjectId = true;
  if (__DEV__) {
    console.error('[push] EAS projectId missing — see docs/go-live.md §5');
    return;
  }
  // The analytics registry (@masalim/analytics) is the server-side allowlist;
  // the condition rides on ERROR_SHOWN with a `scope` so it is not dropped.
  void api.analytics
    .track({
      events: [
        {
          name: AnalyticsEvent.ERROR_SHOWN,
          timestamp: Date.now(),
          properties: { scope: 'push_token_unavailable', reason: 'missing_project_id' },
        },
      ],
    })
    .catch(() => undefined);
}

/**
 * Expo push token, or null when unavailable (simulator, missing projectId,
 * offline). Failures are logged once and never crash the app.
 */
async function getPushTokenSafe(): Promise<string | null> {
  const projectId = easProjectId();
  if (projectId == null) {
    reportMissingProjectId();
    return null;
  }
  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (error) {
    if (!warnedTokenUnavailable) {
      warnedTokenUnavailable = true;
      console.warn('[push] Expo push token unavailable:', error);
    }
    return null;
  }
}

/**
 * Ask for permission (checking the existing status first) and register the
 * device token with the API. Safe to call on every sign-in; never throws.
 */
export async function registerForPush(): Promise<void> {
  if (!pushSupported()) return;

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Masalım',
        importance: Notifications.AndroidImportance.MAX,
      });
    } catch {
      // Channel creation is cosmetic — never block registration on it.
    }
  }

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && (existing.canAskAgain || existing.status === 'undetermined')) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.granted;
  }
  if (!granted) return;

  const expoPushToken = await getPushTokenSafe();
  if (expoPushToken == null) return;

  try {
    await api.devices.register({
      expoPushToken,
      platform: Platform.OS === 'ios' ? DevicePlatform.IOS : DevicePlatform.ANDROID,
    });
  } catch {
    // Best-effort — registration retries on the next sign-in/app start.
  }
}

/** Best-effort device token removal (sign-out). Never throws. */
export async function unregisterPush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const expoPushToken = await getPushTokenSafe();
    if (expoPushToken == null) return;
    await api.devices.remove(expoPushToken);
  } catch {
    // Token unavailable or API unreachable — dead tokens get pruned server-side.
  }
}

/**
 * Push payload → route contract (`data.route`, see @masalim/notifications
 * PushRoutes). Used by both the tap listener and the cold-start response.
 */
export function handleNotificationResponse(
  response: Notifications.NotificationResponse,
  router: Pick<ImperativeRouter, 'push'>,
): void {
  const data = response.notification.request.content.data;
  const route = data?.route;
  if (typeof route === 'string' && route.startsWith('/')) {
    router.push(route as never);
  }
}
