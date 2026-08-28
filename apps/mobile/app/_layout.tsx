import 'react-native-gesture-handler';
import '../src/lib/i18n';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import {
  Fraunces_400Regular_Italic,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  useFonts,
} from '@expo-google-fonts/fraunces';
import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import { colors } from '@masalim/ui';
import {
  configureNotificationHandler,
  handleNotificationResponse,
  registerForPush,
} from '../src/lib/push';
import { queryClient, queryPersister } from '../src/lib/query';
import { useAuthStore } from '../src/stores/auth';

void SplashScreen.preventAutoHideAsync();

// Foreground notification presentation is app-wide — configure it once.
configureNotificationHandler();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_400Regular_Italic,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });
  const authStatus = useAuthStore((state) => state.status);
  const restore = useAuthStore((state) => state.restore);
  const coldStartTapHandled = useRef(false);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    if (fontsLoaded && authStatus !== 'restoring') {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, authStatus]);

  // Device push registration — only once a session exists (token → /devices).
  useEffect(() => {
    if (authStatus === 'signedIn') {
      void registerForPush();
    }
  }, [authStatus]);

  // Notification taps while the app is alive → deep link on `data.route`.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response, router);
    });
    return () => subscription.remove();
  }, []);

  // Cold-start tap: process the launch notification once, after fonts load and
  // session restore completes (the navigator is mounted by then).
  useEffect(() => {
    if (
      Platform.OS === 'web' ||
      !fontsLoaded ||
      authStatus === 'restoring' ||
      coldStartTapHandled.current
    ) {
      return;
    }
    coldStartTapHandled.current = true;
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response != null) {
        handleNotificationResponse(response, router);
      }
    });
  }, [fontsLoaded, authStatus]);

  if (!fontsLoaded || authStatus === 'restoring') {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: queryPersister, maxAge: 24 * 60 * 60 * 1000 }}
        >
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
