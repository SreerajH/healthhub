// The notification feed, built from the mock data so it always matches what's in the app.

import type { IconName } from '@/components/healthhub';
import { C } from '@/constants/healthhub';
import { todayISO, type Appointment, type Doctor, type LabBooking, type LabPackage, type Member, type Reminder } from '@/data/types';

import { dayLabel, daysFromToday, timeLabel } from './dates';
import { firstName, namesList } from './family';

export type Note = {
  id: string;
  title: string;
  body: string;
  when: string;
  unread: boolean;
  group: 'Today' | 'Earlier';
  icon: IconName;
  bg: string;
  fg: string;
  href?: { pathname: string; params?: Record<string, string> };
};

export function buildNotifications({
  appointments, labBookings, reminders, members, recordsCount, doctors = [], packages = [],
}: {
  appointments: Appointment[]; labBookings: LabBooking[]; reminders: Reminder[]; members: Member[];
  recordsCount: number; doctors?: Doctor[]; packages?: LabPackage[];
}): Note[] {
  const name = (id: string) => { const m = members.find((x) => x.id === id); return m ? firstName(m) : 'your family'; };
  const notes: Note[] = [];

  notes.push({
    id: 'n-report', title: 'Report ready',
    body: `${name('m-kabir')}'s complete blood count from Lal PathLabs is ready to view.`,
    when: '2 h ago', unread: true, group: 'Today', icon: 'Document', bg: C.tealSoft, fg: C.tealText,
    href: { pathname: '/records' },
  });

  const vaccine = reminders.find((r) => r.kind === 'vaccine' && daysFromToday(r.startDate) >= 0);
  if (vaccine) {
    const days = daysFromToday(vaccine.startDate);
    notes.push({
      id: 'n-' + vaccine.id,
      title: days === 0 ? 'Vaccine due today' : `Vaccine due in ${days} day${days === 1 ? '' : 's'}`,
      body: `${name(vaccine.memberId)}'s ${vaccine.name} is due on ${dayLabel(vaccine.startDate)}.`,
      when: '5 h ago', unread: true, group: 'Today', icon: 'Syringe', bg: C.warningSoft, fg: C.warningText,
      href: { pathname: '/reminders' },
    });
  }

  const appt = [...appointments].filter((a) => a.status === 'upcoming').sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  if (appt) {
    const d = doctors.find((x) => x.id === appt.doctorId);
    notes.push({
      id: 'n-' + appt.id, title: 'Appointment confirmed',
      body: `${d?.name}, ${dayLabel(appt.startsAt)} at ${timeLabel(appt.startsAt)}. Booking ${appt.code}.`,
      when: '9:12 AM', unread: false, group: 'Today', icon: 'Calendar Tick', bg: C.primarySoft, fg: C.primary,
      href: { pathname: '/booking/[id]', params: { id: appt.id } },
    });
  }

  notes.push({
    id: 'n-dose', title: 'Dose taken',
    body: `${name('m-sunita')} took Metformin 500 mg at 8:34 AM.`,
    when: 'Yesterday', unread: false, group: 'Earlier', icon: 'Pill', bg: C.tealSoft, fg: C.tealText,
    href: { pathname: '/reminders' },
  });

  const lab = [...labBookings].filter((l) => l.status === 'upcoming').sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  if (lab) {
    const p = packages.find((x) => x.id === lab.packageId);
    const names = members.filter((m) => lab.memberIds.includes(m.id)).map(firstName);
    notes.push({
      id: 'n-' + lab.id, title: 'Lab test booked',
      body: `${p?.name} for ${namesList(names)}, ${dayLabel(lab.startsAt)}, ${timeLabel(lab.startsAt)}.`,
      when: 'Mon', unread: false, group: 'Earlier', icon: 'Flask', bg: C.primarySoft, fg: C.primary,
      href: { pathname: '/booking/[id]', params: { id: lab.id } },
    });
  }

  if (recordsCount) {
    notes.push({
      id: 'n-records', title: 'Records are backed up',
      body: `All ${recordsCount} of your family's records are safely stored and encrypted.`,
      when: dayLabel(todayISO()), unread: false, group: 'Earlier', icon: 'Shield Tick', bg: C.tealSoft, fg: C.tealText,
    });
  }

  return notes;
}
