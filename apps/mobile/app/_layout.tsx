import 'react-native-gesture-handler';
import '../src/lib/i18n';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
import { queryClient, queryPersister } from '../src/lib/query';
import { useAuthStore } from '../src/stores/auth';

void SplashScreen.preventAutoHideAsync();

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

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    if (fontsLoaded && authStatus !== 'restoring') {
      void SplashScreen.hideAsync();
    }
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
