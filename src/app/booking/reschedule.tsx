import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, DayStrip, EmptyState, Icon, SlotGrid, StickyFooter, Tag, TopBar, useToast } from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { useBookings, useDoctor, useMembers, useRescheduleAppointment, useSlots } from '@/hooks';
import { daysFrom, groupSlots, whenLabel } from '@/lib/booking';
import { firstName } from '@/lib/family';

/** Figma "HealthHub / Reschedule": the current time, then the same slot picker. */
export default function RescheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { appointments } = useBookings();
  const appt = appointments.find((a) => a.id === id);
  const reschedule = useRescheduleAppointment();
  const { data: members = [] } = useMembers();
  const toast = useToast();

  const { data: d } = useDoctor(appt?.doctorId);
  const { data: slots = [] } = useSlots(appt?.doctorId);
  const days = useMemo(() => daysFrom(slots), [slots]);
  const [at, setAt] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(() => appt?.startsAt.slice(0, 10) ?? days.find((x) => x.available)?.date ?? null);
  const [busy, setBusy] = useState(false);

  if (!appt || !d) {
    return (
      <View style={styles.flex}>
        <TopBar title="Reschedule" />
        <View style={{ paddingTop: 64 }}>
          <EmptyState icon="Clock" badge={false} title="Booking not found" message="It may have been cancelled."
            actionLabel="See bookings" onAction={() => router.replace('/bookings')} />
        </View>
      </View>
    );
  }

  const member = members.find((m) => m.id === appt.memberId);
  const confirm = async () => {
    if (!at) return;
    setBusy(true);
    try {
      await reschedule.mutateAsync({ id: appt.id, slotId: slots.find((s) => s.at === at)?.id ?? '' });
      toast({ message: `Moved to ${whenLabel(at)}` });
      router.back();
    } catch (e) {
      // most often "that slot has just been taken": stay here so another time can be picked
      setAt(null);
      toast({ message: e instanceof Error ? e.message : 'Couldn’t move that. Try again.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.flex}>
      <TopBar title="Reschedule" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.doc}>
          <Avatar initials={d.initials} tone={d.tone} size="M" />
          <View style={{ flex: 1 }}>
            <Text style={[Type.subheading, { color: C.text }]}>{d.name}</Text>
            <Text style={[Type.caption, { color: C.textSecondary }]} numberOfLines={1}>
              {d.specialty}{member ? ` · for ${firstName(member)}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.current}>
          <Icon name="Calendar" size={20} color={C.textSecondary} />
          <Text style={[Type.body, { color: C.textSecondary, flex: 1 }]}>Currently {whenLabel(appt.startsAt)}</Text>
        </View>

        <DayStrip days={days} value={date} onChange={(x) => { setDate(x); if (at && !at.startsWith(x)) setAt(null); }} />
        <SlotGrid groups={groupSlots(slots, date)} value={at} onChange={setAt}
          emptyText={`${d.name} isn't at the clinic on this day. Try another day.`} />

        <View style={{ flexDirection: 'row' }}>
          <Tag label="Free to reschedule up to 2 hours before" icon="Tick Circle" tone="teal" />
        </View>
      </ScrollView>

      <StickyFooter summary={at ? 'New time' : 'Pick a new time'} amount={at ? whenLabel(at) : undefined}>
        <Button label="Confirm new time" fill style={{ flex: 1 }} disabled={!at || at === appt.startsAt} loading={busy} onPress={confirm} />
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.sm, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  doc: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  current: {
    flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.lg, borderRadius: Radius.card,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
});
