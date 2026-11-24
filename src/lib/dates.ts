// Date helpers for the mock data. Dates are local wall-clock strings ("2026-11-19T16:30"), parsed by
// hand so web, Hermes and server rendering all agree (no Intl, no time-zone surprises).

import { todayISO } from '@/data/types';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Parts = { y: number; m: number; d: number; h: number; min: number };
function parts(iso: string): Parts {
  const [date, time = '00:00'] = iso.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return { y, m, d, h, min };
}
const dayNumber = (p: Parts) => Date.UTC(p.y, p.m - 1, p.d) / 86400000;
const weekday = (p: Parts) => DOW[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];

/** "Thu, 19 Nov" */
export function dayLabel(iso: string) {
  const p = parts(iso);
  return `${weekday(p)}, ${p.d} ${MON[p.m - 1]}`;
}
/** "12 Nov 2026" */
export function dateLabel(iso: string) {
  const p = parts(iso);
  return `${p.d} ${MON[p.m - 1]} ${p.y}`;
}
/** "November 2026" */
export function monthLabel(iso: string) {
  const p = parts(iso);
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][p.m - 1] + ' ' + p.y;
}
/** "4:30 PM" */
export function timeLabel(isoOrHm: string) {
  const hm = isoOrHm.includes('T') ? isoOrHm.split('T')[1] : isoOrHm;
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
/** whole days from TODAY (negative = past) */
export function daysFromToday(iso: string, today = todayISO()) {
  return dayNumber(parts(iso)) - dayNumber(parts(today));
}
/** "Today", "Tomorrow", "In 3 days", "Thu, 19 Nov" (beyond a week) */
export function relativeDay(iso: string) {
  const n = daysFromToday(iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n > 1 && n < 7) return `In ${n} days`;
  return dayLabel(iso);
}
/** Greeting by the device clock */
export function greeting(hour = new Date().getHours()) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
