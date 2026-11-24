// Keeps the device's scheduled notifications in step with the reminders and bookings in the app,
// and reacts when someone taps a notification or its Taken / Skip buttons.

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { useAuth } from '@/lib/auth';
import {
  applySchedule, clearSchedule, getPermissionState, handleResponse, hasBeenAsked, requestPermission,
  setupNotifications, type PermissionState,
} from '@/lib/local-notifications';
import { useNotificationPrefs } from '@/lib/notification-prefs';
import { buildPlan } from '@/lib/notification-plan';

import { useBookings } from './bookings';
import { useDoctors, useLabPackages } from './catalog';
import { useMembers } from './family';
import { useReminders } from './reminders';

// ---------- permission, shared by every screen that shows it ----------
type PermissionStore = {
  state: PermissionState | 'unknown';
  refresh: () => Promise<PermissionState>;
  ask: () => Promise<PermissionState>;
};
export const useNotificationPermission = create<PermissionStore>((set) => ({
  state: 'unknown',
  refresh: async () => {
    const state = await getPermissionState().catch(() => 'unsupported' as const);
    set({ state });
    return state;
  },
  ask: async () => {
    const state = await requestPermission().catch(() => 'unsupported' as const);
    set({ state });
    return state;
  },
}));

/**
 * Show our own "why reminders help" screen — once — before the system dialog. Called after someone
 * does something that makes notifications useful (saving a reminder, say).
 */
export async function offerNotifications() {
  if (Platform.OS === 'web') return;
  const state = await useNotificationPermission.getState().refresh();
  if (state !== 'undetermined' || (await hasBeenAsked())) return;
  router.push('/notification-permission');
}

// ---------- keep the schedule current ----------
const NONE: never[] = [];

export function useNotificationSync() {
  const { user } = useAuth();
  const pa = useNotificationPrefs((s) => s.appointments);
  const pm = useNotificationPrefs((s) => s.medicines);
  const pv = useNotificationPrefs((s) => s.vaccines);
  const loaded = useNotificationPrefs((s) => s.loaded);
  const setDropped = useNotificationPrefs((s) => s.setDropped);
  const permission = useNotificationPermission((s) => s.state);
  const refreshPermission = useNotificationPermission((s) => s.refresh);

  const { data: reminders = NONE } = useReminders();
  const { data: members = NONE } = useMembers();
  const { data: doctors = NONE } = useDoctors();
  const { data: packages = NONE } = useLabPackages();
  const { appointments, labBookings } = useBookings();

  // the rolling two-week window needs rebuilding each time the app comes forward
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    refreshPermission();
    setupNotifications();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') { setTick((t) => t + 1); refreshPermission(); }
    });
    return () => sub.remove();
  }, [refreshPermission]);


  const plan = useMemo(
    () => buildPlan({ reminders, appointments, labBookings, members, doctors, packages, prefs: { appointments: pa, medicines: pm, vaccines: pv } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is the day rolling over
    [reminders, appointments, labBookings, members, doctors, packages, pa, pm, pv, tick],
  );

  useEffect(() => {
    if (Platform.OS === 'web' || !loaded) return;
    if (!user || permission !== 'granted') {
      // signed out, or permission withdrawn: nothing should fire
      if (permission !== 'unknown') clearSchedule().catch(() => {});
      return;
    }
    // wait for the family to load: an empty plan would wipe good notifications
    if (!members.length) return;
    setDropped(plan.dropped);
    applySchedule(plan.items).catch(() => {});
  }, [user, permission, plan, members.length, loaded, setDropped]);
}

// ---------- taps and buttons ----------
export function useNotificationResponses() {
  const { user } = useAuth();
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => { handleResponse(r); });
    return () => sub.remove();
  }, []);

  // the app was closed when the notification was tapped: handle it once the session is back
  useEffect(() => {
    if (Platform.OS === 'web' || !user) return;
    let alive = true;
    Notifications.getLastNotificationResponseAsync().then(async (r) => {
      if (!r || !alive) return;
      await handleResponse(r);
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    }).catch(() => {});
    return () => { alive = false; };
  }, [user]);
}
