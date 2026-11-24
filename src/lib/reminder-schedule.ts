// Working out which doses are due today, and how long someone has kept their streak.
// Pure functions over the reminders and the dose log; the data itself comes from src/hooks.

import { todayISO, type Reminder } from '@/data/types';
import type { DoseKey, DoseState } from '@/hooks/reminders';
import { doseKey } from '@/hooks/reminders';

import { addDays } from './booking';

export type DoseLog = Record<DoseKey, { state: DoseState; at: string }>;

export type Dose = {
  key: DoseKey;
  reminder: Reminder;
  time: string;
  state: DoseState | null;
  at?: string;
  /** already past, and not acted on */
  missed: boolean;
};

const weekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const nowStamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${todayISO()}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Is this medicine scheduled on `date`? */
export function runsOn(r: Reminder, date: string) {
  if (r.kind !== 'medicine') return false;
  if (r.startDate > date || (r.endDate && r.endDate < date)) return false;
  return r.days.includes(weekday(date));
}

/** Today's medicine doses for one member, or for everyone, in time order. */
export function dosesFor(reminders: Reminder[], doses: DoseLog, memberId: string | 'all', date = todayISO()): Dose[] {
  const now = nowStamp();
  const out: Dose[] = [];
  for (const r of reminders) {
    if (memberId !== 'all' && r.memberId !== memberId) continue;
    if (!runsOn(r, date)) continue;
    for (const time of r.times) {
      const key = doseKey(r.id, date, time);
      const logged = doses[key];
      out.push({
        key, reminder: r, time, state: logged?.state ?? null, at: logged?.at,
        missed: !logged && `${date}T${time}` < now,
      });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

/** Upcoming vaccines (any member, or one), soonest first. */
export function vaccinesFor(reminders: Reminder[], memberId: string | 'all') {
  return reminders
    .filter((r) => r.kind === 'vaccine' && (memberId === 'all' || r.memberId === memberId))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/**
 * Days in a row, up to yesterday, where every scheduled dose was taken — plus today's,
 * if they're all done. Stops at the first day with a missed or skipped dose.
 */
export function streakFor(reminders: Reminder[], doses: DoseLog, memberId: string | 'all') {
  const mine = reminders.filter((r) => r.kind === 'medicine' && (memberId === 'all' || r.memberId === memberId));
  if (!mine.length) return { days: 0, since: null as string | null };
  const today = todayISO();
  let days = 0;
  let since: string | null = null;
  // today counts only when nothing is still pending
  const todayDue = dosesFor(mine, doses, memberId, today);
  const start = todayDue.length && todayDue.every((d) => d.state === 'taken') ? 0 : 1;
  for (let i = start; i < 90; i++) {
    const date = addDays(today, -i);
    const due = mine.filter((r) => runsOn(r, date)).flatMap((r) => r.times.map((t) => doseKey(r.id, date, t)));
    if (!due.length) continue; // no doses that day: doesn't break the streak
    if (!due.every((k) => doses[k]?.state === 'taken')) break;
    days++;
    since = date;
  }
  return { days, since };
}

/** The times behind "After breakfast" and friends on the add-reminder form. */
export const WHEN_PRESETS: { label: string; time: string }[] = [
  { label: 'Before breakfast', time: '07:30' },
  { label: 'After breakfast', time: '08:30' },
  { label: 'After lunch', time: '14:00' },
  { label: 'After dinner', time: '21:00' },
  { label: 'At bedtime', time: '22:30' },
];

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

/** "Every day", "Mon, Wed, Fri", "Weekly on Tuesdays" */
export function repeatLabel(days: number[]) {
  if (days.length === 7) return 'Every day';
  if (days.length === 1) return `Weekly on ${DAY_LONG[days[0]]}`;
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'Weekdays';
  if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends';
  return [...days].sort().map((d) => DAY_SHORT[d]).join(', ');
}

export { DAY_SHORT };

// ---------- when a dose can be marked ----------
/** A dose can be marked taken from this many minutes before its time (not, say, a 9 PM dose at noon). */
export const TAKE_EARLY_MIN = 60;

/** "21:00" → "20:00": the earliest a dose at `time` can be marked taken */
export function takeFrom(time: string) {
  const [h, m] = time.split(':').map(Number);
  const mins = Math.max(0, h * 60 + m - TAKE_EARLY_MIN);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** Is today's dose at `time` still too far ahead to mark? */
export function notYet(time: string, now = new Date()) {
  const nowHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return nowHm < takeFrom(time);
}
