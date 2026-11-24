import { router } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Chip, ChipRow, DoctorCard, EmptyState, Icon, IconButton, LabPackageCard, RecordCard, SectionHeader,
} from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { RECORD_TYPE_LABEL } from '@/data/types';
import { useDoctors, useLabPackages, useNextSlots, useRecords, useSpecialties , useMembers } from '@/hooks';
import { slotLabel, useDraft } from '@/lib/booking';
import { dateLabel } from '@/lib/dates';
import { firstName } from '@/lib/family';

import { useSelectedMember } from '@/lib/selected-member';

const RECENT = ['Paediatrician near Indiranagar', 'Thyroid profile', 'Fever and cough', 'Full body checkup'];
type Tab = 'all' | 'doctors' | 'labs' | 'records';
const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'doctors', label: 'Doctors' }, { value: 'labs', label: 'Lab tests' }, { value: 'records', label: 'Records' },
];

/** Figma "HealthHub / Search results": one field, tabs, and results across doctors, tests and records. */
export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  // keep typing smooth: results catch up a render later
  const query = useDeferredValue(q).trim().toLowerCase();

  const { data: records = [] } = useRecords();
  const { data: members = [] } = useMembers();
  const { data: doctors = [] } = useDoctors();
  const { data: labPackages = [] } = useLabPackages();
  const { data: specialties = [] } = useSpecialties();
  const { data: nextByDoctor = {} } = useNextSlots(doctors.map((d) => d.id));
  const memberId = useSelectedMember((s) => s.memberId);
  const startDraft = useDraft((s) => s.start);

  const results = useMemo(() => {
    if (query.length < 2) return null;
    const spec = specialties.filter((s) => `${s.label} ${s.keywords}`.toLowerCase().includes(query));
    const specIds = spec.map((s) => s.id);
    return {
      doctors: doctors.filter((d) => `${d.name} ${d.specialty} ${d.clinic} ${d.area}`.toLowerCase().includes(query) || specIds.includes(d.specialtyId)),
      // a test whose name matches comes before one that only mentions it in its contents
      labs: labPackages
        .filter((p) => `${p.name} ${p.description} ${p.groups.map((g) => g.name).join(' ')}`.toLowerCase().includes(query))
        .sort((a, b) => Number(b.name.toLowerCase().includes(query)) - Number(a.name.toLowerCase().includes(query))),
      records: records.filter((r) => {
        const m = members.find((x) => x.id === r.memberId);
        return `${r.title} ${r.provider} ${RECORD_TYPE_LABEL[r.type]} ${m?.name ?? ''}`.toLowerCase().includes(query);
      }),
    };
  }, [query, records, members, doctors, labPackages, specialties]);

  const total = results ? results.doctors.length + results.labs.length + results.records.length : 0;
  const show = (t: Tab) => tab === 'all' || tab === t;
  const limit = (n: number) => (tab === 'all' ? Math.min(n, 2) : n);

  return (
    <View style={[styles.flex, { paddingTop: insets.top + Space.sm }]}>
      <View style={styles.bar}>
        <IconButton icon="Arrow Left" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={styles.field}>
          <Icon name="Search" size={22} color={C.textSecondary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder="Search doctors, tests, medicines, records"
            placeholderTextColor={C.textSecondary}
            style={[Type.body, styles.input]}
            returnKeyType="search"
            accessibilityLabel="Search"
          />
          {q ? <IconButton icon="Close" accessibilityLabel="Clear search" onPress={() => setQ('')} /> : null}
        </View>
      </View>

      {results ? (
        <ChipRow label="Filter results">
          {TABS.map((t) => <Chip key={t.value} label={t.label} active={tab === t.value} onPress={() => setTab(t.value)} />)}
        </ChipRow>
      ) : null}

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {!results ? (
          <View style={{ gap: Space.sm }}>
            <Text style={[Type.bodyMedium, { color: C.textSecondary }]}>Recent searches</Text>
            {RECENT.map((r) => (
              <Pressable key={r} onPress={() => setQ(r)} accessibilityRole="button" accessibilityLabel={`Search ${r}`} style={styles.recent}>
                <Icon name="Clock" size={20} color={C.textSecondary} />
                <Text style={[Type.body, { color: C.text, flex: 1 }]}>{r}</Text>
                <Icon name="Arrow Right" size={18} color={C.textSecondary} />
              </Pressable>
            ))}
          </View>
        ) : total === 0 ? (
          <View style={{ paddingTop: Space.xxxl }}>
            <EmptyState icon="Search" badge={false} title={`No results for “${q.trim()}”`}
              message="Try a doctor's name, a specialty, a symptom or a test." />
          </View>
        ) : (
          <>
            {show('labs') && results.labs.length ? (
              <View style={{ gap: Space.md }}>
                <SectionHeader title="Lab tests" actionLabel={tab === 'all' && results.labs.length > 2 ? `See all ${results.labs.length}` : undefined}
                  onAction={() => setTab('labs')} />
                {results.labs.slice(0, limit(results.labs.length)).map((p) => (
                  <LabPackageCard key={p.id} pkg={p} width="100%"
                    onPress={() => router.push({ pathname: '/labs/[id]', params: { id: p.id } })}
                    onBook={() => { startDraft({ kind: 'lab', packageId: p.id, memberIds: [memberId] }); router.push({ pathname: '/book/lab/[packageId]', params: { packageId: p.id } }); }} />
                ))}
              </View>
            ) : null}

            {show('doctors') && results.doctors.length ? (
              <View style={{ gap: Space.md }}>
                <SectionHeader title="Doctors" actionLabel={tab === 'all' && results.doctors.length > 2 ? `See all ${results.doctors.length}` : undefined}
                  onAction={() => setTab('doctors')} />
                {results.doctors.slice(0, limit(results.doctors.length)).map((d) => {
                  const next = nextByDoctor[d.id] ?? null;
                  return (
                    <DoctorCard key={d.id} doctor={d} next={next ? slotLabel(next) : null}
                      onPress={() => router.push({ pathname: '/doctors/[id]', params: { id: d.id } })}
                      onBook={() => { startDraft({ kind: 'doctor', doctorId: d.id, memberId }); router.push({ pathname: '/book/doctor/[doctorId]', params: { doctorId: d.id } }); }} />
                  );
                })}
              </View>
            ) : null}

            {show('records') && results.records.length ? (
              <View style={{ gap: Space.md }}>
                <SectionHeader title="Your records" actionLabel={tab === 'all' && results.records.length > 2 ? `See all ${results.records.length}` : undefined}
                  onAction={() => setTab('records')} />
                {results.records.slice(0, limit(results.records.length)).map((r) => {
                  const m = members.find((x) => x.id === r.memberId);
                  return (
                    <RecordCard key={r.id} type={r.type} title={r.title} provider={r.provider || 'No doctor or lab added'}
                      meta={`${m ? firstName(m) : ''} · ${dateLabel(r.date)}`} files={r.attachments?.length ?? r.files}
                      onPress={() => router.push({ pathname: '/record/[id]', params: { id: r.id } })} />
                  );
                })}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Space.md, paddingBottom: Space.sm },
  field: {
    flex: 1, height: 52, borderRadius: Radius.pill, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.primary,
    flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingLeft: Space.lg, paddingRight: 4,
  },
  input: { flex: 1, color: C.text, paddingVertical: 0, outlineWidth: 0 },
  content: { padding: Space.screen, paddingTop: Space.md, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  recent: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: Space.md },
});
