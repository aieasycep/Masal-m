import { Stack } from 'expo-router';

/** Physical-book checkout flow (configure → address → review → success) — screens draw their own headers. */
export default function CheckoutLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
