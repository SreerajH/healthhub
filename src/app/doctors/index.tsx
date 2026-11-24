import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionSheet, Button, Chip, ChipRow, DoctorCard, EmptyState, ErrorState, Icon, Skeleton, TopBar } from '@/components/healthhub';
import { C, Space, Type } from '@/constants/healthhub';
import { todayISO } from '@/data/types';
import { useDoctors, useNextSlots, useSpecialties } from '@/hooks';
import { slotLabel, useDraft } from '@/lib/booking';
import { useSelectedMember } from '@/lib/selected-member';

type FilterKey = 'today' | 'fee' | 'exp' | 'rating' | 'female';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'today', label: 'Available today' },
  { key: 'fee', label: 'Fee under ₹700' },
  { key: 'exp', label: '10+ yrs experience' },
  { key: 'rating', label: '4.5★ and above' },
  { key: 'female', label: 'Female doctor' },
];
type SortKey = 'relevance' | 'fee' | 'experience' | 'rating' | 'distance';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'fee', label: 'Fee: low to high' },
  { key: 'experience', label: 'Most experienced' },
  { key: 'rating', label: 'Highest rated' },
  { key: 'distance', label: 'Nearest' },
];

/** Figma "HealthHub / Doctor list": filters, count + sort, DoctorCards. */
export default function DoctorListScreen() {
  const { specialty } = useLocalSearchParams<{ specialty?: string }>();
  const { data: specialties = [] } = useSpecialties();
  const spec = specialties.find((s) => s.id === specialty);
  const { data: doctors = [], isLoading, error, refetch } = useDoctors(specialty);
  const { data: nextByDoctor = {} } = useNextSlots(doctors.map((d) => d.id));
  const memberId = useSelectedMember((s) => s.memberId);
  const startDraft = useDraft((s) => s.start);
  const [on, setOn] = useState<FilterKey[]>([]);
  const [sort, setSort] = useState<SortKey>('relevance');
  const [sortOpen, setSortOpen] = useState(false);

  const list = useMemo(() => {
    const rows = doctors
      .map((d) => ({ d, next: nextByDoctor[d.id] ?? null }))
      .filter(({ d, next }) =>
        (!on.includes('today') || next?.startsWith(todayISO())) &&
        (!on.includes('fee') || d.feeInr < 700) &&
        (!on.includes('exp') || d.experienceYears >= 10) &&
        (!on.includes('rating') || d.rating >= 4.5) &&
        (!on.includes('female') || d.gender === 'female'));
    const by: Record<SortKey, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
      // relevance: soonest slot first, then rating
      relevance: (a, b) => (a.next ?? 'z').localeCompare(b.next ?? 'z') || b.d.rating - a.d.rating,
      fee: (a, b) => a.d.feeInr - b.d.feeInr,
      experience: (a, b) => b.d.experienceYears - a.d.experienceYears,
      rating: (a, b) => b.d.rating - a.d.rating || b.d.reviewCount - a.d.reviewCount,
      distance: (a, b) => a.d.distanceKm - b.d.distanceKm,
    };
    return rows.sort(by[sort]);
  }, [doctors, nextByDoctor, on, sort]);

  const toggle = (k: FilterKey) => setOn((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));
  const book = (doctorId: string) => {
    startDraft({ kind: 'doctor', doctorId, memberId });
    router.push({ pathname: '/book/doctor/[doctorId]', params: { doctorId } });
  };

  return (
    <View style={styles.flex}>
      <TopBar title={spec?.label ?? 'Doctors'} />
      <ScrollView contentContainerStyle={styles.content}>
        <ChipRow label="Filters">
          {FILTERS.map((f) => <Chip key={f.key} label={f.label} active={on.includes(f.key)} onPress={() => toggle(f.key)} />)}
        </ChipRow>

        <View style={styles.countRow}>
          <Text style={[Type.caption, { color: C.textSecondary, flex: 1 }]} accessibilityLiveRegion="polite">
            {list.length} doctor{list.length === 1 ? '' : 's'} near Indiranagar
          </Text>
          <Pressable onPress={() => setSortOpen(true)} accessibilityRole="button" accessibilityLabel={`Sort: ${SORTS.find((s) => s.key === sort)?.label}`}
            style={styles.sort} hitSlop={8}>
            <Icon name="Sort" size={18} color={C.primary} />
            <Text style={[Type.bodyMedium, { color: C.primary }]}>{SORTS.find((s) => s.key === sort)?.label}</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={{ paddingTop: Space.xxl }}><ErrorState message={error.message} onRetry={() => refetch()} /></View>
        ) : isLoading ? (
          <View style={{ gap: Space.lg }} accessibilityLabel="Loading doctors">
            {[0, 1, 2].map((i) => <Skeleton key={i} width="100%" height={190} radius={16} />)}
          </View>
        ) : list.length ? (
          list.map(({ d, next }) => (
            <DoctorCard key={d.id} doctor={d} next={next ? slotLabel(next) : null}
              onPress={() => router.push({ pathname: '/doctors/[id]', params: { id: d.id } })}
              onBook={() => book(d.id)} />
          ))
        ) : (
          <View style={{ paddingTop: Space.xxl, gap: Space.lg, alignItems: 'center' }}>
            <EmptyState icon="Stethoscope" badge={false} title="No doctors match"
              message="Try removing a filter to see more doctors." />
            <Button label="Clear filters" variant="secondary" size="M" onPress={() => setOn([])} />
          </View>
        )}
      </ScrollView>

      <ActionSheet
        visible={sortOpen}
        title="Sort doctors"
        onClose={() => setSortOpen(false)}
        actions={SORTS.map((s) => ({ label: s.label, icon: s.key === sort ? 'Tick' : 'Sort', onPress: () => setSort(s.key) }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.sm, paddingBottom: Space.xxxl, gap: Space.lg, width: '100%', maxWidth: 600, alignSelf: 'center' },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
});
