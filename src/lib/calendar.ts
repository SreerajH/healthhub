// "Add to calendar". Native uses expo-calendar; web opens a Google Calendar template.

import * as Calendar from 'expo-calendar';
import { Linking, Platform } from 'react-native';

export type CalendarResult = 'added' | 'opened' | 'denied' | 'failed';

/** local wall-clock "2026-11-19T16:30" → Date in the device's zone */
function toDate(at: string, addMinutes = 0) {
  const [date, hm] = at.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = hm.split(':').map(Number);
  return new Date(y, m - 1, d, h, min + addMinutes);
}
/** Google Calendar wants UTC basic format: 20261119T110000Z */
const utc = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, '');

export async function addToCalendar({
  title, at, minutes = 30, location, notes,
}: {
  title: string; at: string; minutes?: number; location?: string; notes?: string;
}): Promise<CalendarResult> {
  const start = toDate(at);
  const end = toDate(at, minutes);

  if (Platform.OS === 'web') {
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${utc(start)}/${utc(end)}${location ? `&location=${encodeURIComponent(location)}` : ''}${notes ? `&details=${encodeURIComponent(notes)}` : ''}`;
    const opened = window.open(url, '_blank', 'noopener');
    return opened ? 'opened' : 'failed';
  }

  try {
    const perm = await Calendar.requestCalendarPermissions(true);
    if (!perm.granted) return 'denied';
    const calendar = Calendar.getDefaultCalendarSync();
    await calendar.createEvent({
      title,
      startDate: start,
      endDate: end,
      location,
      notes,
      alarms: [{ relativeOffset: -120 }, { relativeOffset: -24 * 60 }],
    });
    return 'added';
  } catch {
    return 'failed';
  }
}

/** Opens the device's maps app at a place. */
export function openMaps(query: string) {
  const q = encodeURIComponent(query);
  const url = Platform.select({
    ios: `maps:0,0?q=${q}`,
    android: `geo:0,0?q=${q}`,
    default: `https://www.google.com/maps/search/?api=1&query=${q}`,
  });
  return Linking.openURL(url);
}

export const callNumber = (phone: string) => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
