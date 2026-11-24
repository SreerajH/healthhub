import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, ErrorState, Icon, InfoNote, Skeleton, TopBar, type IconName } from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';

import { useDoctors, useSpecialties } from '@/hooks';

/** Figma "HealthHub / Specialties": search, 12-specialty grid, "not sure" tip. */
export default function SpecialtiesScreen() {
  const [q, setQ] = useState('');
  const { data: specialties = [], isLoading, error, refetch } = useSpecialties();
  const { data: doctors = [] } = useDoctors();
  const query = q.trim().toLowerCase();

  const specs = useMemo(
    () => (query ? specialties.filter((s) => `${s.label} ${s.keywords}`.toLowerCase().includes(query)) : specialties),
    [query, specialties],
  );
  const docs = useMemo(
    () => (query.length > 1 ? doctors.filter((d) => `${d.name} ${d.specialty} ${d.clinic}`.toLowerCase().includes(query)) : []),
    [query, doctors],
  );

  return (
    <View style={styles.flex}>
      <TopBar title="Find a doctor" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.search}>
          <Icon name="Search" size={22} color={C.textSecondary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search a doctor, specialty or symptom"
            placeholderTextColor={C.textSecondary}
            accessibilityLabel="Search a doctor, specialty or symptom"
            returnKeyType="search"
            style={[Type.body, styles.searchInput]}
          />
          {q ? (
            <Pressable onPress={() => setQ('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10}>
              <Icon name="Close" size={20} color={C.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        {docs.length ? (
          <View style={{ gap: Space.sm }}>
            <Text style={[Type.subheading, { color: C.text }]}>Doctors</Text>
            {docs.map((d) => (
              <Pressable key={d.id} onPress={() => router.push({ pathname: '/doctors/[id]', params: { id: d.id } })}
                accessibilityRole="button" accessibilityLabel={`${d.name}, ${d.specialty}`}
                style={({ pressed }) => [styles.docRow, pressed && { backgroundColor: C.background }]}>
                <Avatar initials={d.initials} tone={d.tone} size="S" />
                <View style={{ flex: 1 }}>
                  <Text style={[Type.bodyMedium, { color: C.text }]}>{d.name}</Text>
                  <Text style={[Type.caption, { color: C.textSecondary }]}>{d.specialty} · {d.area}</Text>
                </View>
                <Icon name="Chevron Right" size={20} color={C.textSecondary} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {error ? <ErrorState message={error.message} onRetry={() => refetch()} /> : null}
        {isLoading && !specs.length ? (
          <View style={{ gap: Space.md }} accessibilityLabel="Loading specialties">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} width="100%" height={112} radius={16} />)}
          </View>
        ) : null}

        <View style={{ gap: Space.md }}>
          <Text style={[Type.heading, { color: C.text }]} accessibilityRole="header">
            {query ? (specs.length ? 'Specialties' : 'No matching specialty') : 'Choose a specialty'}
          </Text>
          {Array.from({ length: Math.ceil(specs.length / 3) }, (_, r) => specs.slice(r * 3, r * 3 + 3)).map((row, r) => (
            <View key={r} style={styles.gridRow}>
              {row.map((s) => (
                <Pressable key={s.id} onPress={() => router.push({ pathname: '/doctors', params: { specialty: s.id } })}
                  accessibilityRole="button" accessibilityLabel={s.label}
                  style={({ pressed }) => [styles.tile, pressed && { backgroundColor: C.primarySoft }]}>
                  <View style={styles.tileIcon}><Icon name={s.icon as IconName} size={24} color={C.primary} /></View>
                  <Text style={[Type.bodyMedium, styles.tileLabel]} numberOfLines={2}>{s.label}</Text>
                </Pressable>
              ))}
              {Array.from({ length: 3 - row.length }, (_, k) => <View key={`pad${k}`} style={{ flex: 1 }} />)}
            </View>
          ))}
        </View>

        <InfoNote tone="teal">
          Not sure who to see? Start with a general physician. They&apos;ll refer you if needed.
        </InfoNote>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.sm, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: Space.md, height: 52, paddingHorizontal: Space.lg,
    borderRadius: Radius.pill, backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  searchInput: { flex: 1, color: C.text, height: '100%', outlineWidth: 0 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.md, borderRadius: Radius.button, backgroundColor: C.card },
  gridRow: { flexDirection: 'row', gap: Space.md },
  tile: {
    flex: 1, minHeight: 112, borderRadius: Radius.card, backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', gap: Space.sm, padding: Space.sm,
  },
  tileIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { color: C.text, textAlign: 'center' },
});
