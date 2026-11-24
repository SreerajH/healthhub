// Optional unlock with the phone's own biometrics or PIN (expo-local-authentication), saved per device.
// "app": ask when HealthHub opens or comes back after a minute away. "records": only before the Records
// tab and record details. Unlocking lasts until the app has been in the background for a minute.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

export type LockMode = 'off' | 'app' | 'records';
const KEY = 'healthhub.app-lock.v1';
/** how long the app can sit in the background before it locks again */
const GRACE_MS = 60_000;

type LockState = {
  mode: LockMode;
  loaded: boolean;
  unlocked: boolean;
  setMode: (m: LockMode) => void;
  unlock: () => Promise<boolean>;
  lock: () => void;
};

export const useAppLock = create<LockState>((set, get) => ({
  mode: 'off',
  loaded: false,
  unlocked: false,
  setMode: (mode) => {
    // turning it on from this screen counts as unlocked: they've only just proved it's them
    set({ mode, unlocked: true });
    AsyncStorage.setItem(KEY, mode).catch(() => {});
  },
  unlock: async () => {
    const res = await authenticate('Unlock HealthHub');
    if (res.ok) set({ unlocked: true });
    return res.ok;
  },
  lock: () => { if (get().mode !== 'off') set({ unlocked: false }); },
}));

AsyncStorage.getItem(KEY)
  .then((v) => useAppLock.setState({ mode: v === 'app' || v === 'records' ? v : 'off', loaded: true }))
  .catch(() => useAppLock.setState({ loaded: true }));

/** Can this phone lock at all? Something has to be enrolled: a fingerprint, face, or at least a screen PIN. */
export async function lockSupport(): Promise<{ ok: boolean; reason?: string }> {
  if (Platform.OS === 'web') return { ok: false, reason: 'Unlocking needs the phone app.' };
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE) {
    return { ok: false, reason: 'Set up a screen lock (PIN, fingerprint or face) on your phone first.' };
  }
  return { ok: true };
}

export async function authenticate(promptMessage: string) {
  if (Platform.OS === 'web') return { ok: true };
  const r = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancel', disableDeviceFallback: false });
  return { ok: r.success, error: r.success ? undefined : r.error };
}

/** Locks again after a minute in the background. Mount once (the root layout). */
export function useAutoRelock() {
  useEffect(() => {
    let leftAt = 0;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') leftAt = Date.now();
      else if (s === 'active' && leftAt && Date.now() - leftAt > GRACE_MS) useAppLock.getState().lock();
    });
    return () => sub.remove();
  }, []);
}

/** Should this screen be covered right now? */
export function useLocked(scope: 'app' | 'records') {
  const { mode, loaded, unlocked } = useAppLock();
  if (!loaded) return scope === 'app'; // don't flash the app before we know
  if (unlocked || mode === 'off' || Platform.OS === 'web') return false;
  return scope === 'records' ? true : mode === 'app';
}
