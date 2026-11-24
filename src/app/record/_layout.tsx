import { Stack } from 'expo-router';

import { C } from '@/constants/healthhub';

/** One record: details, and upload (modal). The list itself is the Records tab. */
export default function RecordLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.background } }}>
      <Stack.Screen name="[id]" />
      <Stack.Screen name="upload" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
