import { Stack } from 'expo-router';

/** Book flow (builder, cover editor, digital preview) — screens draw their own headers. */
export default function BookLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
