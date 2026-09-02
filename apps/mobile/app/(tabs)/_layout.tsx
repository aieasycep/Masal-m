import { View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { JobProgressDock } from '../../src/components/JobProgressDock';
import { MiniPlayer } from '../../src/components/MiniPlayer';
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
      // Dock above the bar: background job cards, then the mini player.
      tabBar={(props) => (
        <View>
          <JobProgressDock />
          <MiniPlayer />
          <TabBar {...props} />
        </View>
      )}
    >
      <Tabs.Screen name="home" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="library" options={{ title: t('tabs.library') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
