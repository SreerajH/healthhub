// Applies a notification plan with expo-notifications, asks for permission, and handles what happens
// when someone taps a notification or its Taken / Skip buttons. Web has a no-op version (.web.ts).
//
// Expo Go: local notifications work (only remote push was removed from Android Expo Go in SDK 53).
// Whether the Taken / Skip buttons appear in Expo Go isn't documented — see TESTING.md.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';

import { doseKey, doseLogKey, type DoseState } from '@/hooks/reminders';

import { fromLocalStamp } from './map';
import { planKey, ymd, type PlanTrigger, type PlannedNotification } from './notification-plan';
import { queryClient } from './query-client';
import { supabase } from './supabase';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

const ASKED_KEY = 'healthhub.notifications.asked.v1';
export const DOSE_CATEGORY = 'DOSE';
const TAKEN = 'TAKEN';
const SKIP = 'SKIP';

// ---------- setup ----------
let ready: Promise<void> | null = null;

/** One-time setup: show banners while the app is open, create Android channels, register the buttons. */
export function setupNotifications() {
  ready ??= (async () => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true,
      }),
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Medicine and vaccine reminders',
        importance: AndroidImportance.HIGH,
        lightColor: '#1F2E5C',
      });
      await Notifications.setNotificationChannelAsync('bookings', {
        name: 'Appointments and lab tests',
        importance: AndroidImportance.DEFAULT,
        lightColor: '#1F2E5C',
      });
    }

    // category identifiers can't contain ":" or "-"
    await Notifications.setNotificationCategoryAsync(DOSE_CATEGORY, [
      { identifier: TAKEN, buttonTitle: 'Taken', options: { opensAppToForeground: false } },
      { identifier: SKIP, buttonTitle: 'Skip', options: { opensAppToForeground: false } },
    ]);
  })().catch(() => { ready = null; });
  return ready;
}

// ---------- permission ----------
export async function getPermissionState(): Promise<PermissionState> {
  const s = await Notifications.getPermissionsAsync();
  if (s.granted || s.ios?.status === IosAuthorizationStatus.PROVISIONAL) return 'granted';
  // "denied" with canAskAgain still true means the system dialog hasn't been refused for good
  return s.status === 'denied' && !s.canAskAgain ? 'denied' : 'undetermined';
}

/** Shows the system dialog. Android 13+ only shows it once a channel exists, hence setup first. */
export async function requestPermission(): Promise<PermissionState> {
  await setupNotifications();
  await AsyncStorage.setItem(ASKED_KEY, 'yes').catch(() => {});
  await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } });
  return getPermissionState();
}

/** Has our own explanation screen been shown already? (so we never nag) */
export async function hasBeenAsked() {
  return !!(await AsyncStorage.getItem(ASKED_KEY).catch(() => null));
}
export const markAsked = () => AsyncStorage.setItem(ASKED_KEY, 'yes').catch(() => {});

// ---------- scheduling ----------
const toTrigger = (t: PlanTrigger, channelId: string): Notifications.SchedulableNotificationTriggerInput => {
  if (t.kind === 'date') return { type: Notifications.SchedulableTriggerInputTypes.DATE, date: t.at, channelId };
  if (t.kind === 'daily') return { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: t.hour, minute: t.minute, channelId };
  return { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: t.weekday, hour: t.hour, minute: t.minute, channelId };
};

let lastKey: string | null = null;
let queue: Promise<unknown> = Promise.resolve();

/**
 * Makes the device's pending notifications match the plan. Rescheduling everything is simple and
 * can't leave stale ones behind; it only happens when the plan actually changed.
 */
export function applySchedule(items: PlannedNotification[]) {
  const key = planKey(items);
  if (key === lastKey) return Promise.resolve();
  const run = async () => {
    await setupNotifications();
    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const n of items) {
      await Notifications.scheduleNotificationAsync({
        identifier: n.id,
        content: {
          title: n.title, body: n.body, data: n.data, sound: true,
          ...(n.category ? { categoryIdentifier: n.category } : {}),
        },
        trigger: toTrigger(n.trigger, n.channel),
      });
    }
    lastKey = key;
  };
  // one at a time: two overlapping reschedules would cancel each other's work
  queue = queue.then(run, run);
  return queue as Promise<void>;
}

/** Signed out, or notifications turned off: leave nothing pending. */
export function clearSchedule() {
  lastKey = null;
  const run = () => Notifications.cancelAllScheduledNotificationsAsync();
  queue = queue.then(run, run);
  return queue as Promise<void>;
}

// ---------- what a tap does ----------
/** expo reports the delivery time in seconds on some platforms and milliseconds on others */
const toDate = (t: number) => new Date(t < 1e12 ? t * 1000 : t);

async function logDose(reminderId: string, date: string, time: string, state: DoseState) {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return; // signed out: nothing to log to
  const { error } = await supabase.from('reminder_logs').upsert(
    { reminder_id: reminderId, owner_id: userId, due_at: fromLocalStamp(`${date}T${time}`), status: state },
    { onConflict: 'reminder_id,due_at' },
  );
  if (!error) queryClient.invalidateQueries({ queryKey: doseLogKey });
}

export async function handleResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as Record<string, string> | undefined;
  if (!data) return;

  if (data.type === 'dose' && (response.actionIdentifier === TAKEN || response.actionIdentifier === SKIP)) {
    // one-off notifications carry their date; repeating ones fire today
    const date = data.date ?? ymd(toDate(response.notification.date));
    await logDose(data.reminderId, date, data.time, response.actionIdentifier === TAKEN ? 'taken' : 'skipped');
    return;
  }

  // tapping the notification itself opens what it's about
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  if (data.type === 'appointment' || data.type === 'lab') router.push({ pathname: '/booking/[id]', params: { id: data.id } });
  else router.push('/reminders');
}

export { doseKey };
