import { Stack } from 'expo-router';
import { colors } from '@masalim/ui';

/** Settings stack — screens draw their own ScreenHeader on the cream ground. */
export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
