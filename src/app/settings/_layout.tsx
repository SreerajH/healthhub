import { Stack } from 'expo-router';

import { C } from '@/constants/healthhub';

/** The screens behind the Profile rows. */
export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.background } }} />;
}
