import { Redirect } from 'expo-router';
import { useAppPrefs } from '../src/stores/app-prefs';
import { useAuthStore } from '../src/stores/auth';

/**
 * Route decision at cold start: signed-in users land on the tabs; signed-out
 * users who already saw the onboarding go to auth, everyone else to splash.
 */
export default function Index() {
  const status = useAuthStore((state) => state.status);
  const hasSeenOnboarding = useAppPrefs((state) => state.hasSeenOnboarding);

  if (status === 'signedIn') {
    return <Redirect href="/(tabs)/home" />;
  }
  if (hasSeenOnboarding) {
    return <Redirect href="/(auth)/welcome" />;
  }
  return <Redirect href="/(onboarding)/splash" />;
}
