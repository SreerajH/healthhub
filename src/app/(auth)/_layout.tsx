import { Stack } from 'expo-router';

import { C } from '@/constants/healthhub';

/** Everything before the app proper: onboarding, sign-in, the code, and the first profile. */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.background } }}>
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="verify" />
      {/* no going back out of consent or the profile step: the account exists by then */}
      <Stack.Screen name="consent" options={{ gestureEnabled: false }} />
      <Stack.Screen name="create-profile" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
