import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BookingCard, Button, EmptyState, Segmented, TabScreen } from '@/components/healthhub';
import { C, Space, Type } from '@/constants/healthhub';
import { useBookings, useDoctors, useLabPackages, useMembers } from '@/hooks';
import { canChange } from '@/lib/booking';
import { groupOf, pastLabel, pillLabel, rowFor, splitBookings, type AnyBooking } from '@/lib/booking-rows';
import { dayLabel, timeLabel } from '@/lib/dates';

/** Figma "HealthHub / Bookings": Upcoming / Past, grouped This week / Later. */
export default function BookingsScreen() {
  const { appointments } = useBookings();
  const { labBookings } = useBookings();
  const { data: members = [] } = useMembers();
  const { data: doctors = [] } = useDoctors();
  const { data: packages = [] } = useLabPackages();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const { upcoming, past } = useMemo(() => splitBookings(appointments, labBookings), [appointments, labBookings]);
  const list = tab === 'upcoming' ? upcoming : past;

  // upcoming is grouped by "This week" / "Later"; past runs straight down
  const sections = useMemo(() => {
    if (tab === 'past') return [{ title: '', items: past }];
    const out: { title: string; items: AnyBooking[] }[] = [];
    for (const b of upcoming) {
      const title = groupOf(b.booking.startsAt);
      if (out[out.length - 1]?.title !== title) out.push({ title, items: [] });
      out[out.length - 1].items.push(b);
    }
    return out;
  }, [tab, upcoming, past]);

  const open = (b: AnyBooking) => router.push({ pathname: '/booking/[id]', params: { id: b.booking.id } });

  return (
    <TabScreen title="Bookings" gap={Space.lg}>
      <Segmented options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} value={tab} onChange={setTab} />

      {list.length ? (
        sections.map((s) => (
          <View key={s.title || 'all'} style={{ gap: Space.md }}>
            {s.title ? <Text style={[Type.bodyMedium, { color: C.textSecondary }]} accessibilityRole="header">{s.title}</Text> : null}
            {s.items.map((b) => {
              const row = rowFor(b, members, doctors, packages);
              const changeable = tab === 'upcoming' && canChange(b.booking.startsAt, b.kind);
              return (
                <BookingCard
                  key={row.id}
                  row={row}
                  dateLabel={dayLabel(row.at)}
                  timeLabel={timeLabel(row.at)}
                  statusLabel={tab === 'upcoming' ? pillLabel(row.at) : pastLabel(b)}
                  onPress={() => open(b)}
                  // a doctor visit can be moved or cancelled from here; a lab collection opens its details
                  onReschedule={changeable && b.kind === 'doctor' ? () => router.push({ pathname: '/booking/reschedule', params: { id: row.id } }) : undefined}
                  onCancel={changeable && b.kind === 'doctor' ? () => router.push({ pathname: '/booking/[id]', params: { id: row.id, cancel: '1' } }) : undefined}
                />
              );
            })}
          </View>
        ))
      ) : tab === 'upcoming' ? (
        <View style={{ paddingTop: 40, gap: Space.lg, alignItems: 'center' }}>
          <EmptyState
            icon="Calendar"
            title="No upcoming bookings"
            message="Book a doctor or a lab test and it shows up here, with a reminder before each visit."
            actionLabel="Book a doctor"
            actionIcon="Stethoscope"
            onAction={() => router.push('/specialties')}
          />
          <Button label="Book a lab test" icon="Flask" variant="secondary" size="M" onPress={() => router.push('/labs')} />
        </View>
      ) : (
        <View style={{ paddingTop: 40 }}>
          <EmptyState icon="Clock" badge={false} title="Nothing here yet"
            message="Visits and lab tests move here once they're done." />
        </View>
      )}

      {list.length && tab === 'upcoming' ? (
        <View style={styles.actions}>
          <Button label="Book a doctor" icon="Stethoscope" variant="secondary" size="M" fill style={{ flex: 1 }} onPress={() => router.push('/specialties')} />
          <Button label="Book a lab test" icon="Flask" variant="secondary" size="M" fill style={{ flex: 1 }} onPress={() => router.push('/labs')} />
        </View>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: Space.md },
});
