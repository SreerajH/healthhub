import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Chip, DayStrip, EmptyState, SlotGrid, StickyFooter, TopBar } from '@/components/healthhub';
import { C, Space, Type } from '@/constants/healthhub';
import { inr } from '@/data/types';
import { useDoctor, useMembers, useSlots } from '@/hooks';
import { daysFrom, groupSlots, useDraft, whenLabel } from '@/lib/booking';
import { firstName } from '@/lib/family';
import { useSelectedMember } from '@/lib/selected-member';

/** Figma "HealthHub / Choose a time": who it's for, 7-day strip, Morning / Afternoon / Evening slots. */
export default function ChooseTimeScreen() {
  const { doctorId } = useLocalSearchParams<{ doctorId: string }>();
  const { data: d, isLoading } = useDoctor(doctorId);
  const { data: members = [] } = useMembers();
  const { data: slots = [], isLoading: slotsLoading } = useSlots(doctorId);
  const selected = useSelectedMember((s) => s.memberId);
  const draft = useDraft();

  const days = useMemo(() => daysFrom(slots), [slots]);

  const sameFlow = draft.kind === 'doctor' && draft.doctorId === doctorId;
  const [memberId, setMemberId] = useState(() => (sameFlow && draft.memberId) || selected);
  const [at, setAt] = useState<string | null>(() => (sameFlow && draft.at) || null);
  const [pickedDate, setPickedDate] = useState<string | null>(() => (sameFlow && draft.at ? draft.at.slice(0, 10) : null));
  // until someone picks a day, show the first one with free slots
  const date = pickedDate ?? days.find((x) => x.available)?.date ?? null;
  const setDate = setPickedDate;

  if (!d && !isLoading) {
    return (
      <View style={styles.flex}>
        <TopBar title="Choose a time" />
        <View style={{ paddingTop: 64 }}>
          <EmptyState icon="Calendar" badge={false} title="Doctor not found" message="Pick a doctor to see their times."
            actionLabel="Find a doctor" onAction={() => router.replace('/specialties')} />
        </View>
      </View>
    );
  }

  const groups = groupSlots(slots, date);
  const slotId = slots.find((s) => s.at === at)?.id;
  const member = members.find((m) => m.id === memberId);
  if (!d) return <View style={styles.flex}><TopBar title="Choose a time" /></View>;

  const next = () => {
    if (!at || !memberId) return;
    draft.start({ kind: 'doctor', doctorId: doctorId, memberId, at, slotId, payment: draft.payment });
    router.push('/book/review');
  };

  return (
    <View style={styles.flex}>
      <TopBar title="Choose a time" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.doc}>
          <Avatar initials={d.initials} tone={d.tone} size="M" />
          <View style={{ flex: 1 }}>
            <Text style={[Type.subheading, { color: C.text }]}>{d.name}</Text>
            <Text style={[Type.caption, { color: C.textSecondary }]} numberOfLines={1}>{d.specialty} · {d.clinic}</Text>
          </View>
        </View>

        <View style={{ gap: Space.xs }} accessibilityRole="radiogroup" accessibilityLabel="Who is this for?">
          <Text style={[Type.bodyMedium, { color: C.text }]}>Who is this for?</Text>
          <View style={styles.chips}>
            {members.map((m) => (
              <Chip key={m.id} label={firstName(m)} active={m.id === memberId} onPress={() => setMemberId(m.id)} />
            ))}
          </View>
        </View>

        <DayStrip days={days} value={date} onChange={(x) => { setDate(x); if (at && !at.startsWith(x)) setAt(null); }} />

        <SlotGrid groups={groups} value={at} onChange={setAt}
          emptyText={slotsLoading ? 'Loading times…' : `${d.name} isn't at the clinic on this day. Try another day.`} />
      </ScrollView>

      <StickyFooter
        summary={at ? `${whenLabel(at)}${member ? ` · ${firstName(member)}` : ''}` : 'Pick a time to continue'}
        amount={inr(d.feeInr)}>
        <Button label="Continue" fill style={{ flex: 1 }} onPress={next} disabled={!at} />
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.sm, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  doc: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Space.sm },
});
