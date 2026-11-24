// "Coming up" for one family member: next appointment, lab collection, medicine dose and due vaccine.

import { useMemo } from 'react';

import { todayISO, type Doctor, type LabPackage } from '@/data/types';
import { dayLabel, daysFromToday, relativeDay, timeLabel } from '@/lib/dates';
import { notYet } from '@/lib/reminder-schedule';

import { useBookings } from './bookings';
import { useLabPackages, useDoctors } from './catalog';
import { useReminders } from './reminders';

export type ComingUpItem = {
  id: string;
  kind: 'appointment' | 'lab' | 'medicine' | 'vaccine';
  at: string; // sortable local stamp
  title: string;
  subtitle: string;
  when: string;
  pill: { status: 'upcoming' | 'dueSoon'; label?: string };
  action: { label: string; icon: 'Directions' | 'Calendar' | 'Tick' | 'Info' | 'Alarm' };
};

export function useComingUp(memberId?: string) {
  const { appointments, labBookings, isLoading: bookingsLoading } = useBookings();
  const { data: reminders = [], isLoading: remindersLoading } = useReminders();
  const { data: doctors = [] } = useDoctors();
  const { data: packages = [] } = useLabPackages();

  const items = useMemo(() => {
    if (!memberId) return [];
    const now = new Date();
    const stamp = (d: Date) => {
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    const NOW = stamp(now);
    const today = todayISO();
    const byId = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id);
    const out: ComingUpItem[] = [];

    for (const a of appointments) {
      if (a.memberId !== memberId || a.status !== 'upcoming' || a.startsAt < NOW) continue;
      const d: Doctor | undefined = byId(doctors, a.doctorId);
      out.push({
        id: a.id, kind: 'appointment', at: a.startsAt,
        title: d ? `${d.specialty} visit` : 'Appointment',
        subtitle: d ? `${d.name} · ${d.clinic}` : '',
        when: `${dayLabel(a.startsAt)} · ${timeLabel(a.startsAt)}`,
        pill: { status: 'upcoming', label: relativeDay(a.startsAt) },
        action: { label: 'Directions', icon: 'Directions' },
      });
    }

    for (const l of labBookings) {
      if (!l.memberIds.includes(memberId) || l.status !== 'upcoming' || l.startsAt < NOW) continue;
      const p: LabPackage | undefined = byId(packages, l.packageId);
      out.push({
        id: l.id, kind: 'lab', at: l.startsAt,
        title: p?.name ?? 'Lab test',
        subtitle: p?.fastingHours ? `Home collection · fast ${p.fastingHours} hours before` : 'Home collection',
        when: `${dayLabel(l.startsAt)} · ${timeLabel(l.startsAt)}`,
        pill: { status: 'upcoming', label: relativeDay(l.startsAt) },
        action: { label: 'View details', icon: 'Info' },
      });
    }

    for (const r of reminders) {
      if (r.memberId !== memberId) continue;
      if (r.kind === 'vaccine') {
        const days = daysFromToday(r.startDate);
        if (days < 0 || days > 30) continue;
        out.push({
          id: r.id, kind: 'vaccine', at: `${r.startDate}T${r.times[0] ?? '10:00'}`,
          title: r.name, subtitle: r.note ?? '',
          when: `Due ${dayLabel(r.startDate)}`,
          pill: { status: 'dueSoon', label: days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days` },
          action: { label: 'Book vaccine', icon: 'Calendar' },
        });
      } else {
        // today's next dose, if it's a dose day and still ahead of now
        const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
        if (!r.days.includes(dow) || r.startDate > today || (r.endDate && r.endDate < today)) continue;
        const next = r.times.map((t) => `${today}T${t}`).find((t) => t >= NOW);
        if (!next) continue;
        out.push({
          id: r.id, kind: 'medicine', at: next,
          title: r.name, subtitle: r.note ? `${r.dose} · ${r.note}` : r.dose,
          when: `Today · ${timeLabel(next)}`,
          pill: { status: 'upcoming', label: 'Today' },
          // only offer Mark as taken once the dose is close; until then the button opens Reminders
          action: notYet(next.slice(11)) ? { label: 'See reminders', icon: 'Alarm' } : { label: 'Mark as taken', icon: 'Tick' },
        });
      }
    }

    return out.sort((a, b) => (a.at < b.at ? -1 : 1));
  }, [memberId, appointments, labBookings, reminders, doctors, packages]);

  return { items, isLoading: bookingsLoading || remindersLoading };
}
