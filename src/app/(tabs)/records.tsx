import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, EmptyState, ErrorState, IconButton, RecordCard, RecordsGate, Skeleton, TabScreen } from '@/components/healthhub';
import { C, Space, TabBarGap, TabBarHeight, Type } from '@/constants/healthhub';
import { byDateDesc, type RecordType } from '@/data/types';
import { useMembers, useRecords } from '@/hooks';
import { dateLabel, monthLabel } from '@/lib/dates';
import { firstName } from '@/lib/family';

const TYPES: { value: RecordType | 'all'; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'prescription', label: 'Prescriptions' },
  { value: 'lab_report', label: 'Lab reports' },
  { value: 'scan', label: 'Scans' },
  { value: 'vaccine', label: 'Vaccines' },
  { value: 'discharge', label: 'Discharge' },
];

/** Figma "HealthHub / Records": member + type filters, records grouped by month, Upload button. */
function RecordsScreenInner() {
  const params = useLocalSearchParams<{ member?: string }>();
  const { data: members = [] } = useMembers();
  const { data: all = [], isLoading, error, refetch } = useRecords();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<RecordType | 'all'>('all');
  // the member filter lives in the URL, so links (Home "See all", member details) can set it
  const memberId = params.member && members.some((m) => m.id === params.member) ? params.member : 'all';
  const setMember = (id: string) => router.setParams({ member: id === 'all' ? undefined : id });

  const shown = useMemo(
    () => all.filter((r) => (memberId === 'all' || r.memberId === memberId) && (type === 'all' || r.type === type)).sort(byDateDesc),
    [all, memberId, type],
  );
  const groups = useMemo(() => {
    const out: { month: string; items: typeof shown }[] = [];
    for (const r of shown) {
      const m = monthLabel(r.date);
      if (out[out.length - 1]?.month !== m) out.push({ month: m, items: [] });
      out[out.length - 1].items.push(r);
    }
    return out;
  }, [shown]);

  const filtered = memberId !== 'all' || type !== 'all';
  const who = members.find((m) => m.id === memberId);
  const upload = () => router.push({ pathname: '/record/upload', params: memberId !== 'all' ? { member: memberId } : {} });

  return (
    <View style={styles.flex}>
      <TabScreen
        title="Records"
        right={<IconButton icon="Search" variant="soft" accessibilityLabel="Search records" onPress={() => router.push('/search')} />}
        gap={Space.lg}>
        {error ? (
          <View style={{ paddingTop: Space.xxl }}>
            <ErrorState message={error.message} onRetry={() => refetch()} />
          </View>
        ) : isLoading ? (
          <View style={{ gap: Space.md }} accessibilityLabel="Loading records">
            {[0, 1, 2].map((i) => <Skeleton key={i} width="100%" height={96} radius={16} />)}
          </View>
        ) : all.length === 0 ? (
          <View style={{ paddingTop: Space.xxxl }}>
            <EmptyState
              icon="Document"
              title="No records yet"
              message="Keep prescriptions, lab reports and scans for the whole family in one safe place."
              actionLabel="Upload a record"
              actionIcon="Upload"
              onAction={upload}
            />
          </View>
        ) : (
          <>
            <View style={{ gap: Space.sm }}>
              <FilterRow label="Filter by family member">
                <Chip label="Everyone" active={memberId === 'all'} onPress={() => setMember('all')} />
                {members.map((m) => (
                  <Chip key={m.id} label={m.relation === 'self' ? 'You' : firstName(m)} active={memberId === m.id} onPress={() => setMember(m.id)} />
                ))}
              </FilterRow>
              <FilterRow label="Filter by record type">
                {TYPES.map((t) => (
                  <Chip key={t.value} label={t.label} active={type === t.value} onPress={() => setType(t.value)} />
                ))}
              </FilterRow>
            </View>

            <Text style={[Type.caption, { color: C.textSecondary }]} accessibilityLiveRegion="polite">
              {shown.length} record{shown.length === 1 ? '' : 's'}
              {who ? ` for ${who.relation === 'self' ? 'you' : firstName(who)}` : ''}
            </Text>

            {groups.length ? (
              groups.map((g) => (
                <View key={g.month} style={{ gap: Space.md }}>
                  <Text style={[Type.subheading, { color: C.text }]} accessibilityRole="header">{g.month}</Text>
                  {g.items.map((r) => {
                    const m = members.find((x) => x.id === r.memberId);
                    const n = r.attachments?.length ?? r.files;
                    return (
                      <RecordCard
                        key={r.id}
                        type={r.type}
                        title={r.title}
                        provider={r.provider || 'No doctor or lab added'}
                        meta={`${m ? firstName(m) : 'Unknown'} · ${dateLabel(r.date)}`}
                        files={n}
                        onPress={() => router.push({ pathname: '/record/[id]', params: { id: r.id } })}
                      />
                    );
                  })}
                </View>
              ))
            ) : (
              <View style={styles.noMatch}>
                <Text style={[Type.heading, { color: C.text, textAlign: 'center' }]}>No matching records</Text>
                <Text style={[Type.body, { color: C.textSecondary, textAlign: 'center' }]}>
                  {who ? `${who.relation === 'self' ? 'You have' : firstName(who) + ' has'} no` : 'There are no'}{' '}
                  {type === 'all' ? 'records' : TYPES.find((t) => t.value === type)?.label.toLowerCase()} yet.
                </Text>
                {filtered ? <Button label="Clear filters" variant="secondary" size="M" onPress={() => { setType('all'); setMember('all'); }} /> : null}
              </View>
            )}
            {/* room for the Upload button above the tab bar */}
            <View style={{ height: 52 }} />
          </>
        )}
      </TabScreen>

      {all.length ? (
        <View style={[styles.fab, { bottom: insets.bottom + TabBarHeight + TabBarGap + Space.lg }]} pointerEvents="box-none">
          <Button label="Upload" icon="Upload" onPress={upload} style={styles.fabButton} />
        </View>
      ) : null}
    </View>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      style={styles.filterScroll}
      contentContainerStyle={styles.filterRow}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  // run the chip rows to the screen edges, keep the first chip aligned with the content
  filterScroll: { marginHorizontal: -Space.screen, flexGrow: 0 },
  filterRow: { paddingHorizontal: Space.screen, gap: Space.sm },
  noMatch: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.xxxl },
  fab: { position: 'absolute', right: Space.screen, left: Space.screen, alignItems: 'flex-end' },
  fabButton: { boxShadow: '0 6px 16px rgba(46, 68, 130, 0.28)' },
});

/** Covered by the records lock when it is on. */
export default function RecordsScreen() {
  return <RecordsGate><RecordsScreenInner /></RecordsGate>;
}
