import { Stack } from 'expo-router';

import { C } from '@/constants/healthhub';

/** Reminders: the schedule, and add (modal). */
export default function RemindersLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
