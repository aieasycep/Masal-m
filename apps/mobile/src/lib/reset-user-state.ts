import AsyncStorage from '@react-native-async-storage/async-storage';
import { queryClient } from './query';
import { useAppPrefs } from '../stores/app-prefs';
import { useJobsStore } from '../stores/jobs';
import { usePlayerStore } from '../stores/player';

/**
 * Wipe everything that belongs to the signed-in account, not the device.
 * Called on BOTH sign-out and sign-in: the persisted query cache and the
 * selected-child pref are keyed globally, so without this a second account
 * on the same phone inherits the previous account's children/stories
 * (privacy leak + FORBIDDEN_OWNERSHIP on story create with a stale child).
 * Device-level prefs (hasSeenOnboarding) intentionally survive.
 */
export async function resetPerUserState(): Promise<void> {
  queryClient.clear();
  useAppPrefs.getState().setSelectedChildId(null);
  useJobsStore.getState().clear();
  usePlayerStore.getState().clearNowPlaying();
  try {
    await AsyncStorage.removeItem('masalim.query-cache');
  } catch {
    // Best-effort: an unremovable cache entry only means one more 24h TTL.
  }
}
