// Which kinds of reminder the person wants. Kept on the device (a notification is local, so is the choice).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { DEFAULT_PREFS, type NotificationPrefs } from './notification-plan';

const KEY = 'healthhub.notification-prefs.v1';

type Store = NotificationPrefs & {
  loaded: boolean;
  set: (key: keyof NotificationPrefs, value: boolean) => void;
  /** reminders that didn't fit under the platform's limit on pending notifications */
  dropped: number;
  setDropped: (n: number) => void;
};

export const useNotificationPrefs = create<Store>((set, get) => ({
  ...DEFAULT_PREFS,
  loaded: false,
  dropped: 0,
  // only when it changes: a set() with the same value still re-renders every subscriber, and the sync
  // hook that calls this subscribes to the whole store, so that was an endless loop
  setDropped: (dropped) => { if (get().dropped !== dropped) set({ dropped }); },
  set: (key, value) => {
    set({ [key]: value } as Partial<Store>);
    const { appointments, medicines, vaccines } = get();
    AsyncStorage.setItem(KEY, JSON.stringify({ appointments, medicines, vaccines })).catch(() => {});
  },
}));

// load the saved choices once, at startup
AsyncStorage.getItem(KEY)
  .then((raw) => {
    const saved = raw ? (JSON.parse(raw) as Partial<NotificationPrefs>) : {};
    useNotificationPrefs.setState({ ...DEFAULT_PREFS, ...saved, loaded: true });
  })
  .catch(() => useNotificationPrefs.setState({ loaded: true }));
