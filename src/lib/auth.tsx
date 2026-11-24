// Who's signed in, and the one-time-code flow that gets them there.

import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Tables } from '@/types/database';

import { authErrorMessage, supabase } from './supabase';

export type Profile = Tables<'profiles'>;
/** a phone number in E.164 ("+919845012345") or an email address */
export type Identifier = { kind: 'phone'; value: string } | { kind: 'email'; value: string };

type AuthValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** still working out whether anyone is signed in */
  loading: boolean;
  /** signed in, but hasn't told us their name yet */
  needsProfile: boolean;
  sendCode: (id: Identifier) => Promise<{ error?: string }>;
  verifyCode: (id: Identifier, token: string) => Promise<{ error?: string }>;
  /** development builds only: sign in as the dev account, skipping the email code */
  devSignIn: () => Promise<{ error?: string }>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile(data ?? null);
    return data ?? null;
  }, []);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      if (alive) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next?.user) loadProfile(next.user.id);
      else setProfile(null);
    });

    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const sendCode = useCallback(async (id: Identifier) => {
    const { error } = await supabase.auth.signInWithOtp(
      id.kind === 'phone' ? { phone: id.value } : { email: id.value },
    );
    return error ? { error: authErrorMessage(error.message) } : {};
  }, []);

  const verifyCode = useCallback(async (id: Identifier, token: string) => {
    const { error } = await supabase.auth.verifyOtp(
      id.kind === 'phone'
        ? { phone: id.value, token, type: 'sms' }
        : { email: id.value, token, type: 'email' },
    );
    return error ? { error: authErrorMessage(error.message) } : {};
  }, []);

  const userId = session?.user.id;
  const devSignIn = useCallback(async () => {
    // `__DEV__` is false in release builds, so this body (and the credentials) are stripped there
    if (!__DEV__) return { error: 'Not available.' };
    const email = process.env.EXPO_PUBLIC_DEV_EMAIL;
    const password = process.env.EXPO_PUBLIC_DEV_PASSWORD;
    if (!email || !password) return { error: 'Set EXPO_PUBLIC_DEV_EMAIL and EXPO_PUBLIC_DEV_PASSWORD in .env.' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: authErrorMessage(error.message) } : {};
  }, []);

  const refreshProfile = useCallback(async () => {
    if (userId) await loadProfile(userId);
  }, [userId, loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo<AuthValue>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    loading,
    // a signed-in account with no name yet still has to finish creating its profile
    needsProfile: !!session && !loading && !profile?.full_name,
    sendCode,
    verifyCode,
    devSignIn,
    refreshProfile,
    signOut,
  }), [session, profile, loading, sendCode, verifyCode, devSignIn, refreshProfile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------- phone helpers ----------
/** digits a user typed → "+919845012345" (India by default) */
export function toE164(input: string, country = '+91') {
  const digits = input.replace(/\D/g, '');
  if (input.trim().startsWith('+')) return '+' + digits;
  if (digits.length > 10 && digits.startsWith('91')) return '+' + digits;
  return country + digits;
}

/** "+919845012345" → "+91 98450 12345" */
export function prettyPhone(e164: string) {
  const m = e164.match(/^\+(\d{1,3})(\d{5})(\d{5})$/);
  return m ? `+${m[1]} ${m[2]} ${m[3]}` : e164;
}

export const isValidIndianMobile = (e164: string) => /^\+91[6-9]\d{9}$/.test(e164);
export const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

export const labelFor = (id: Identifier) => (id.kind === 'phone' ? prettyPhone(id.value) : id.value);
