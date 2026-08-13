import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import type { ImperativeRouter } from 'expo-router';
import { DevicePlatform } from '@masalim/types';
import { api } from './api';

/** Warn about a missing push token (no EAS projectId in dev) only once per launch. */
let warnedTokenUnavailable = false;

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
 * Expo push token, or null when unavailable (simulator, missing projectId in
 * dev, offline). Failures are logged once and never crash the app.
 */
async function getPushTokenSafe(): Promise<string | null> {
  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch (error) {
    if (!warnedTokenUnavailable) {
      warnedTokenUnavailable = true;
      console.warn(
        '[push] Expo push token unavailable (missing EAS projectId in dev is fine):',
        error,
      );
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
    const token = await Notifications.getExpoPushTokenAsync();
    await api.devices.remove(token.data);
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
