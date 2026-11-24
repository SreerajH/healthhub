// Turns the family's reminders and bookings into the list of local notifications to schedule.
// Pure on purpose (no Expo imports): the same input always gives the same plan, so it can be
// tested without a phone. src/lib/local-notifications.ts applies the plan.
//
// Two platform limits shape it:
//  - iOS keeps at most 64 pending local notifications, so repeating triggers are used wherever a
//    reminder is open-ended (one trigger covers every future dose), and the total is capped.
//  - A repeating trigger can't have an end date, so reminders that start later or end on a date get
//    explicit one-off notifications for the next two weeks. The plan is rebuilt whenever the app opens.

import type { Appointment, Doctor, LabBooking, LabPackage, Member, Reminder } from '@/data/types';

export type PlanTrigger =
  | { kind: 'date'; at: Date }
  | { kind: 'daily'; hour: number; minute: number }
  /** weekday 1–7, with 1 = Sunday (what expo-notifications expects) */
  | { kind: 'weekly'; weekday: number; hour: number; minute: number };

export type PlannedNotification = {
  id: string;
  channel: 'reminders' | 'bookings';
  title: string;
  body: string;
  trigger: PlanTrigger;
  /** adds the Taken / Skip buttons */
  category?: 'DOSE';
  data: Record<string, string>;
};

export type NotificationPrefs = { appointments: boolean; medicines: boolean; vaccines: boolean };
export const DEFAULT_PREFS: NotificationPrefs = { appointments: true, medicines: true, vaccines: true };

/** iOS allows 64 pending; keep a few spare */
export const MAX_SCHEDULED = 60;
const WINDOW_DAYS = 14;

type Input = {
  reminders: Reminder[];
  appointments: Appointment[];
  labBookings: LabBooking[];
  members: Member[];
  doctors: Doctor[];
  packages: LabPackage[];
  prefs: NotificationPrefs;
};

// ---------- small local-time helpers ----------
const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** "2026-11-19" + "16:30" → a Date in the device's zone */
export function at(date: string, time = '00:00') {
  const [y, m, d] = date.split('T')[0].split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0);
}
/** a booking stamp like "2026-11-19T16:30" */
const stamp = (s: string) => at(s.slice(0, 10), s.slice(11, 16));
const clock = (d: Date) => `${((d.getHours() + 11) % 12) + 1}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (d: Date) => `${DAY[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`;
const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3600 * 1000);
const first = (name?: string) => (name ? name.split(' ')[0] : '');

export function buildPlan(input: Input, now = new Date()): { items: PlannedNotification[]; dropped: number } {
  const { reminders, appointments, labBookings, members, doctors, packages, prefs } = input;
  const who = (id: string) => first(members.find((m) => m.id === id)?.name);
  const repeating: PlannedNotification[] = [];
  const oneOff: PlannedNotification[] = [];
  const soonest = new Date(now.getTime() + 60 * 1000); // nothing in the next minute

  const today = ymd(now);

  // ---------- medicines ----------
  if (prefs.medicines) {
    for (const r of reminders) {
      if (r.kind !== 'medicine' || !r.times.length || !r.days.length) continue;
      const days = [...new Set(r.days)].sort();
      const openEnded = !r.endDate && r.startDate <= today;
      const body = [r.dose, who(r.memberId)].filter(Boolean).join(' · ') + (r.note ? `. ${r.note}` : '');

      for (const time of r.times) {
        const [hour, minute] = time.split(':').map(Number);
        const base = { channel: 'reminders' as const, title: `Time for ${r.name}`, body, category: 'DOSE' as const };

        if (openEnded) {
          const data = { type: 'dose', reminderId: r.id, time };
          if (days.length === 7) {
            repeating.push({ ...base, id: `med.${r.id}.${time}.daily`, trigger: { kind: 'daily', hour, minute }, data });
          } else {
            for (const d of days) {
              repeating.push({ ...base, id: `med.${r.id}.${time}.w${d}`, trigger: { kind: 'weekly', weekday: d + 1, hour, minute }, data });
            }
          }
          continue;
        }

        // bounded or not started yet: one-off notifications for the next two weeks
        for (let i = 0; i < WINDOW_DAYS; i++) {
          const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
          const date = ymd(day);
          if (date < r.startDate || (r.endDate && date > r.endDate) || !days.includes(day.getDay())) continue;
          const when = at(date, time);
          if (when < soonest) continue;
          oneOff.push({ ...base, id: `med.${r.id}.${time}.${date}`, trigger: { kind: 'date', at: when }, data: { type: 'dose', reminderId: r.id, time, date } });
        }
      }
    }
  }

  // ---------- vaccines: a week before, and on the day ----------
  if (prefs.vaccines) {
    for (const r of reminders) {
      if (r.kind !== 'vaccine') continue;
      const due = at(r.startDate, '10:00');
      const week = new Date(due.getFullYear(), due.getMonth(), due.getDate() - 7, 10, 0);
      const who_ = who(r.memberId);
      const subject = `${who_ ? `${who_}'s ` : ''}${r.name}`;
      if (week >= soonest) {
        oneOff.push({ id: `vax.${r.id}.week`, channel: 'reminders', title: 'Vaccine due in a week', body: `${subject} is due on ${dayLabel(due)}.`, trigger: { kind: 'date', at: week }, data: { type: 'vaccine', reminderId: r.id } });
      }
      if (due >= soonest) {
        oneOff.push({ id: `vax.${r.id}.day`, channel: 'reminders', title: 'Vaccine due today', body: `${subject} is due today.`, trigger: { kind: 'date', at: due }, data: { type: 'vaccine', reminderId: r.id } });
      }
    }
  }

  // ---------- appointments: 24 hours and 2 hours before ----------
  if (prefs.appointments) {
    for (const a of appointments) {
      if (a.status !== 'upcoming') continue;
      const start = stamp(a.startsAt);
      const d = doctors.find((x) => x.id === a.doctorId);
      const patient = who(a.memberId);
      const detail = `${d?.name ?? 'Your doctor'}${d?.clinic ? ` · ${d.clinic}` : ''}, ${clock(start)}`;
      const data = { type: 'appointment', id: a.id };
      const dayBefore = addHours(start, -24);
      const twoHours = addHours(start, -2);
      if (dayBefore >= soonest) {
        oneOff.push({ id: `appt.${a.id}.24h`, channel: 'bookings', title: patient ? `${patient}'s appointment is tomorrow` : 'Appointment tomorrow', body: detail, trigger: { kind: 'date', at: dayBefore }, data });
      }
      if (twoHours >= soonest) {
        oneOff.push({ id: `appt.${a.id}.2h`, channel: 'bookings', title: 'Appointment in 2 hours', body: detail, trigger: { kind: 'date', at: twoHours }, data });
      }
    }

    // ---------- lab collections: the evening before, and 2 hours before ----------
    for (const l of labBookings) {
      if (l.status !== 'upcoming') continue;
      const start = stamp(l.startsAt);
      const p = packages.find((x) => x.id === l.packageId);
      const names = l.memberIds.map(who).filter(Boolean).join(' and ');
      const data = { type: 'lab', id: l.id };
      const evening = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1, 20, 0);
      const twoHours = addHours(start, -2);
      if (evening >= soonest) {
        oneOff.push({
          id: `lab.${l.id}.eve`, channel: 'bookings', title: `${p?.name ?? 'Lab test'} tomorrow`,
          body: p?.fastingHours ? `Fast for ${p.fastingHours} hours before the sample. Water is fine. Collection at ${clock(start)}.` : `Sample collection at ${clock(start)}${names ? ` for ${names}` : ''}.`,
          trigger: { kind: 'date', at: evening }, data,
        });
      }
      if (twoHours >= soonest) {
        oneOff.push({ id: `lab.${l.id}.2h`, channel: 'bookings', title: 'Sample collection in 2 hours', body: `${p?.name ?? 'Lab test'} at ${clock(start)}. Please be at home.`, trigger: { kind: 'date', at: twoHours }, data });
      }
    }
  }

  // repeating ones first (each covers every future dose), then the soonest one-offs, up to the cap
  oneOff.sort((x, y) => (x.trigger.kind === 'date' && y.trigger.kind === 'date' ? x.trigger.at.getTime() - y.trigger.at.getTime() : 0));
  const all = [...repeating, ...oneOff];
  return { items: all.slice(0, MAX_SCHEDULED), dropped: Math.max(0, all.length - MAX_SCHEDULED) };
}

/** Stable text for a plan, so unchanged plans aren't rescheduled. */
export function planKey(items: PlannedNotification[]) {
  return JSON.stringify(items.map((i) => [i.id, i.title, i.body, i.trigger.kind === 'date' ? i.trigger.at.getTime() : i.trigger]));
}
