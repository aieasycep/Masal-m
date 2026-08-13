import { Stack } from 'expo-router';
import { colors } from '@masalim/ui';

/** Voice Studio stack (list + creation flow) — screens draw their own headers. */
export default function VoiceLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
