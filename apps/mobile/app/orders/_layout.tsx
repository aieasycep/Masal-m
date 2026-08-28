import { Stack } from 'expo-router';

/** Order tracking (list + detail) — screens draw their own headers. */
export default function OrdersLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
