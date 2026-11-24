import { Stack } from 'expo-router';

import { C } from '@/constants/healthhub';

/** One booking: details, and reschedule (modal). */
export default function BookingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.background } }}>
      <Stack.Screen name="[id]" />
      <Stack.Screen name="reschedule" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
