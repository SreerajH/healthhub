import { Stack } from 'expo-router';

import { C } from '@/constants/healthhub';

/** Family section: list → member details → add / edit (modal). */
export default function FamilyLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="edit" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
