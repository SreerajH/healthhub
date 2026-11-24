import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, DayStrip, EmptyState, InfoNote, SlotGrid, StickyFooter, TopBar } from '@/components/healthhub';
import { C, Space } from '@/constants/healthhub';
import { inr } from '@/data/types';
import { useLabPackage } from '@/hooks';
import { labDays, labSlotsFor, useDraft, whenLabel } from '@/lib/booking';

/** Figma "HealthHub / Sample collection time". */
export default function LabSlotScreen() {
  const draft = useDraft();
  const { data: p } = useLabPackage(draft.kind === 'lab' ? draft.packageId : undefined);
  const days = useMemo(() => labDays(), []);
  const [at, setAt] = useState<string | null>(draft.at ?? null);
  const [date, setDate] = useState<string | null>(() => at?.slice(0, 10) ?? days.find((d) => d.available)?.date ?? null);

  if (!p || !draft.memberIds.length) {
    return (
      <View style={styles.flex}>
        <TopBar title="Sample collection time" />
        <View style={{ paddingTop: 64 }}>
          <EmptyState icon="Flask" badge={false} title="Start with a test" message="Choose a lab test and who it's for first."
            actionLabel="See lab tests" onAction={() => router.replace('/labs')} />
        </View>
      </View>
    );
  }

  const total = p.priceInr * draft.memberIds.length;
  return (
    <View style={styles.flex}>
      <TopBar title="Sample collection time" />
      <ScrollView contentContainerStyle={styles.content}>
        <InfoNote tone="navy" icon="Home">
          A trained phlebotomist visits your home.{p.fastingHours ? ' Early slots work best for fasting tests.' : ''}
        </InfoNote>
        <DayStrip days={days} value={date} onChange={(x) => { setDate(x); if (at && !at.startsWith(x)) setAt(null); }} />
        <SlotGrid groups={labSlotsFor(date)} value={at} onChange={setAt} />
      </ScrollView>
      <StickyFooter summary={at ? whenLabel(at) : 'Pick a time to continue'} amount={inr(total)}>
        <Button label="Review booking" fill style={{ flex: 1 }} disabled={!at}
          onPress={() => { draft.update({ at: at! }); router.push('/book/review'); }} />
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.sm, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
});
