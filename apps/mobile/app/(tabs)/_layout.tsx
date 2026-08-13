import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fontFamilies } from '@masalim/ui';
import { useAuthStore } from '../../src/stores/auth';

/**
 * Tab shell. The custom bottom bar with the raised "Oluştur" button is built
 * in the design pass; labels and structure are final.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const status = useAuthStore((state) => state.status);

  if (status === 'signedOut') {
    return <Redirect href="/(onboarding)/splash" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fontFamilies.bodyBold, fontSize: 10 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="library" options={{ title: t('tabs.library') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
