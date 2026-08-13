import { Stack } from 'expo-router';

/** Story flow (creation wizard, generating, player) — screens draw their own headers. */
export default function StoryLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
