// Browsers can't schedule local notifications, so on web all of this is a no-op and the permission
// state is "unsupported" (the screens hide their notification controls when they see that).

import type { Notification, NotificationResponse } from 'expo-notifications';

import type { PlannedNotification } from './notification-plan';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';
export const DOSE_CATEGORY = 'DOSE';

export const setupNotifications = async () => {};
export const getPermissionState = async (): Promise<PermissionState> => 'unsupported';
export const requestPermission = async (): Promise<PermissionState> => 'unsupported';
export const hasBeenAsked = async () => true;
export const markAsked = async () => {};
export const applySchedule = async (_items: PlannedNotification[]) => {};
export const clearSchedule = async () => {};
export const handleResponse = async (_response: NotificationResponse | Notification) => {};
