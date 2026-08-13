import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TabBar } from '../../src/components/TabBar';
import { useAuthStore } from '../../src/stores/auth';

/** Tab shell with the custom bottom bar (raised "Oluştur" button). */
export default function TabsLayout() {
  const { t } = useTranslation();
  const status = useAuthStore((state) => state.status);

  if (status === 'signedOut') {
    return <Redirect href="/(onboarding)/splash" />;
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="home" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="library" options={{ title: t('tabs.library') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
