import { useKeepAwake } from 'expo-keep-awake';

/**
 * Prevents the screen from sleeping while mounted. Render it ONLY during
 * long-running on-screen work (generation/recording states) so the device
 * can sleep normally everywhere else. expo-keep-awake ships inside the expo
 * package — no addition to the frozen native surface.
 */
export function KeepScreenAwake() {
  useKeepAwake();
  return null;
}
