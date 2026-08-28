import { Stack } from 'expo-router';
import { colors } from '@masalim/ui';

/** Subscription stack (paywall, quota) — screens draw their own headers. */
export default function SubscriptionLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
