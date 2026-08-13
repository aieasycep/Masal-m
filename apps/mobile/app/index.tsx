import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/stores/auth';

/** Route decision at cold start: signed-in users land on the tabs, others on splash/onboarding. */
export default function Index() {
  const status = useAuthStore((state) => state.status);

  if (status === 'signedIn') {
    return <Redirect href="/(tabs)/home" />;
  }
  return <Redirect href="/(onboarding)/splash" />;
}
