// Turns stored appointments and lab bookings into the rows the Bookings list and details screens show.

import type { BookingRow } from '@/components/healthhub';
import { nowISO, type Appointment, type Doctor, type LabBooking, type LabPackage, type Member } from '@/data/types';

import { daysFromToday, relativeDay } from './dates';
import { firstName, namesList } from './family';

export type AnyBooking = { kind: 'doctor'; booking: Appointment } | { kind: 'lab'; booking: LabBooking };

export function rowFor(b: AnyBooking, members: Member[], doctors: Doctor[] = [], packages: LabPackage[] = []): BookingRow {
  if (b.kind === 'doctor') {
    const a = b.booking;
    const d = doctors.find((x) => x.id === a.doctorId);
    const m = members.find((x) => x.id === a.memberId);
    return {
      id: a.id, kind: 'doctor', status: a.status, at: a.startsAt,
      title: d?.name ?? 'Appointment',
      subtitle: d ? `${d.specialty}\n${d.clinic}` : '',
      forLine: m ? `For ${firstName(m)}` : '',
      avatar: d ? { initials: d.initials, tone: d.tone } : undefined,
    };
  }
  const l = b.booking;
  const p = packages.find((x) => x.id === l.packageId);
  const names = members.filter((x) => l.memberIds.includes(x.id)).map(firstName);
  return {
    id: l.id, kind: 'lab', status: l.status, at: l.startsAt,
    title: p?.name ?? 'Lab test',
    subtitle: p?.lab ? `${p.lab}, ${l.addressLabel?.split(',').pop()?.trim() ?? ''}`.replace(/,\s*$/, '') : '',
    forLine: names.length ? `For ${namesList(names)}` : '',
    tags: [
      { label: 'Home collection', icon: 'Home' as const, tone: 'teal' as const },
      ...(p?.fastingHours ? [{ label: `Fast ${p.fastingHours} hours before`, icon: 'Clock' as const, tone: 'amber' as const }] : []),
    ],
  };
}

/** All bookings, newest-first for past and soonest-first for upcoming. */
export function splitBookings(appointments: Appointment[], labBookings: LabBooking[]) {
  const all: AnyBooking[] = [
    ...appointments.map((booking) => ({ kind: 'doctor' as const, booking })),
    ...labBookings.map((booking) => ({ kind: 'lab' as const, booking })),
  ];
  const at = (b: AnyBooking) => b.booking.startsAt;
  const now = nowISO();
  const upcoming = all.filter((b) => b.booking.status === 'upcoming' && at(b) >= now).sort((a, b) => at(a).localeCompare(at(b)));
  const past = all.filter((b) => b.booking.status !== 'upcoming' || at(b) < now).sort((a, b) => at(b).localeCompare(at(a)));
  return { upcoming, past };
}

/** "This week" (within 7 days) or "Later" */
export const groupOf = (at: string) => (daysFromToday(at) <= 7 ? 'This week' : 'Later');

/** The pill on an upcoming booking: "Today", "In 2 days", then just "Upcoming" once it's further off
 *  (the card already shows the date, so repeating it reads oddly). */
export const pillLabel = (at: string) => (daysFromToday(at) <= 7 ? relativeDay(at) : undefined);

/** A past booking's status label, since a done visit reads better than "Completed" alone. */
export function pastLabel(b: AnyBooking) {
  if (b.booking.status === 'cancelled') return 'Cancelled';
  return b.kind === 'doctor' ? 'Visited' : 'Sample taken';
}
