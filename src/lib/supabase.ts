// The Supabase client. Sessions are kept in AsyncStorage and refreshed while the app is in the foreground.

import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from '@/types/database';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    'Supabase is not configured. Copy .env.example to .env and fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
  );
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    // on web the session lives in localStorage, which createClient picks by default
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // no OAuth redirects come back through a URL in the app
    detectSessionInUrl: false,
  },
});

// Refresh tokens only while the app is in front: a background app shouldn't hold the network open.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Supabase errors are terse; this is what we actually show someone. */
export function authErrorMessage(message: string) {
  const m = message.toLowerCase();
  if (m.includes('invalid') && m.includes('otp')) return 'That code isn\'t right. Check it and try again.';
  if (m.includes('expired')) return 'That code has expired. Ask for a new one.';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('after')) return 'Too many tries. Wait a minute and try again.';
  if (m.includes('sms provider') || m.includes('unsupported phone') || m.includes('phone provider') || m.includes('phone_provider_disabled')) {
    return 'Phone sign-in isn\'t switched on for this project yet. Use email for now.';
  }
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'New accounts are switched off for this project.';
  if (m.includes('network') || m.includes('fetch')) return 'Couldn\'t reach HealthHub. Check your connection.';
  return message;
}
