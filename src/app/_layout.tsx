import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { router, Stack, useRootNavigationState, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';

import { ONBOARDED_KEY } from '@/app/(auth)/onboarding';
import {
  AppLockGate, CoachMarksProvider, ConsentPrompt, OfflineBanner, PrivacyShield, SplashOverlay, ToastProvider,
} from '@/components/healthhub';
import { useAutoRelock } from '@/lib/app-lock';
import { C, FontFiles } from '@/constants/healthhub';
import { useNotificationResponses, useNotificationSync } from '@/hooks/notifications';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useConsents } from '@/lib/consent';
import { queryClient } from '@/lib/query-client';
import { destinationFor, groupOf, isAllowed, PATHS } from '@/lib/route-guard';
import { useSelectedMemberSync } from '@/lib/selected-member';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = { anchor: '(tabs)' };


export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FontFiles);
  // keep the native splash up until Instrument Sans is ready (falls back to the system font on error)
  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <CoachMarksProvider>
            <StatusBar style="dark" />
            <RootStack />
            <OfflineBanner />
            <Gates />
            <ConsentPrompt />
            <PrivacyShield />
            <SplashOverlay />
          </CoachMarksProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** The whole-app lock, only once someone is signed in and inside the app. */
function Gates() {
  const { session, needsProfile } = useAuth();
  useAutoRelock();
  return <AppLockGate enabled={!!session && !needsProfile} />;
}

function RootStack() {
  useAuthRouting();
  useSelectedMemberSync();
  useNotificationSync();
  useNotificationResponses();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.background } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
      <Stack.Screen name="search" options={{ animation: 'fade' }} />
      <Stack.Screen name="family" />
      <Stack.Screen name="record" />
      <Stack.Screen name="booking" />
      <Stack.Screen name="reminders" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="notification-permission" options={{ presentation: 'modal' }} />
      {/* paid: no swipe back into the booking flow */}
      <Stack.Screen name="book/confirmed" options={{ gestureEnabled: false, animation: 'fade' }} />
    </Stack>
  );
}

/** Sends people to onboarding, sign-in, the profile step or the app, whichever they belong on. */
function useAuthRouting() {
  const { session, needsProfile, loading: authLoading } = useAuth();
  const consents = useConsents();
  // while signed in, wait for the consent rows too (a failed load counts as "ask again")
  const loading = authLoading || (!!session && consents.isPending && !consents.isError);
  const needsConsent = !!session && !consents.has('account');
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED_KEY)
      .then((v) => setOnboarded(!!v))
      .catch(() => setOnboarded(true));
  }, []);

  useEffect(() => {
    // wait until the navigator exists and we know both answers
    if (!navigationState?.key || loading || onboarded === null) return;

    const where = destinationFor({ session: !!session, needsConsent, needsProfile, onboarded });
    const current = groupOf(segments as string[]);
    if (isAllowed(where, current)) { lastSent.current = null; return; }

    const path = PATHS[where];
    if (lastSent.current === path) return; // don't fight a redirect that's already in flight
    lastSent.current = path;
    router.replace(path as never);
  }, [navigationState?.key, loading, onboarded, session, needsConsent, needsProfile, segments]);
}
