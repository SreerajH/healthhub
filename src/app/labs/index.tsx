import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chip, ChipRow, ErrorState, Icon, LabPackageCard, Segmented, Skeleton, TopBar } from '@/components/healthhub';
import { C, Space, Type } from '@/constants/healthhub';
import type { LabCategory } from '@/data/types';
import { useLabPackages } from '@/hooks';
import { useDraft } from '@/lib/booking';
import { useSelectedMember } from '@/lib/selected-member';

const CATEGORIES: { value: LabCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'full', label: 'Full body' },
  { value: 'diabetes', label: 'Diabetes' },
  { value: 'thyroid', label: 'Thyroid' },
  { value: 'senior', label: 'Senior citizen' },
  { value: 'child', label: 'Child wellness' },
];

/** Figma "HealthHub / Lab packages": packages or single tests, category filter, Book. */
export default function LabsScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<'package' | 'test'>(params.tab === 'tests' ? 'test' : 'package');
  const [cat, setCat] = useState<LabCategory | 'all'>('all');
  const memberId = useSelectedMember((s) => s.memberId);
  const startDraft = useDraft((s) => s.start);
  const { data: labPackages = [], isLoading, error, refetch } = useLabPackages();

  const list = useMemo(
    () => labPackages.filter((p) => p.kind === tab && (tab === 'test' || cat === 'all' || p.category === cat)),
    [tab, cat, labPackages],
  );
  const book = (packageId: string) => {
    startDraft({ kind: 'lab', packageId, memberIds: [memberId] });
    router.push({ pathname: '/book/lab/[packageId]', params: { packageId } });
  };

  return (
    <View style={styles.flex}>
      <TopBar title="Lab tests" />
      <ScrollView contentContainerStyle={styles.content}>
        <Segmented options={[{ value: 'package', label: 'Health packages' }, { value: 'test', label: 'Single tests' }]} value={tab} onChange={setTab} />

        {tab === 'package' ? (
          <ChipRow label="Package type">
            {CATEGORIES.map((c) => <Chip key={c.value} label={c.label} active={cat === c.value} onPress={() => setCat(c.value)} />)}
          </ChipRow>
        ) : null}

        <View style={styles.nabl}>
          <Icon name="Shield Tick" size={20} color={C.tealText} />
          <Text style={[Type.bodyMedium, { color: C.tealText, flex: 1 }]}>NABL-accredited labs · free home sample collection</Text>
        </View>

        {error ? <ErrorState message={error.message} onRetry={() => refetch()} /> : null}
        {isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} width="100%" height={180} radius={16} />) : null}
        {list.map((p) => (
          <LabPackageCard key={p.id} pkg={p} width="100%"
            onPress={() => router.push({ pathname: '/labs/[id]', params: { id: p.id } })}
            onBook={() => book(p.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.sm, paddingBottom: Space.xxxl, gap: Space.lg, width: '100%', maxWidth: 600, alignSelf: 'center' },
  nabl: { flexDirection: 'row', gap: Space.sm, alignItems: 'flex-start' },
});
