import { Redirect } from 'expo-router';
import { useAppPrefs } from '../src/stores/app-prefs';
import { useAuthStore } from '../src/stores/auth';

/**
 * Route decision at cold start: signed-in users land on the tabs; signed-out
 * users who already saw the onboarding go to auth, everyone else to splash.
 * A signed-in user who never finished child setup (killed the app mid-flow)
 * is sent back to it — new users must not reach Home without a child profile.
 * When the session was restored from tokens (user not loaded yet), Home
 * applies the same gate once /users/me resolves.
 */
export default function Index() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const hasSeenOnboarding = useAppPrefs((state) => state.hasSeenOnboarding);

  if (status === 'signedIn') {
    if (user != null && !user.onboardingCompleted) {
      return <Redirect href="/children/new" />;
    }
    return <Redirect href="/(tabs)/home" />;
  }
  if (hasSeenOnboarding) {
    return <Redirect href="/(auth)/welcome" />;
  }
  return <Redirect href="/(onboarding)/splash" />;
}
