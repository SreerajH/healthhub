import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState, Icon, InfoNote, Skeleton, StatTiles, StickyFooter, Tag, TopBar } from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { inr } from '@/data/types';
import { useLabPackage } from '@/hooks';
import { useDraft } from '@/lib/booking';
import { useSelectedMember } from '@/lib/selected-member';

/** Figma "HealthHub / Package details": price, stats, preparation, tests included (expandable). */
export default function PackageDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: p, isLoading } = useLabPackage(id);
  const memberId = useSelectedMember((s) => s.memberId);
  const startDraft = useDraft((s) => s.start);
  const [open, setOpen] = useState<number | null>(0);

  if (!p) {
    if (isLoading) {
      return (
        <View style={styles.flex}>
          <TopBar title="Lab test" />
          <View style={{ padding: Space.screen, gap: Space.lg }}>
            <Skeleton width="100%" height={160} radius={16} />
            <Skeleton width="100%" height={72} radius={12} />
            <Skeleton width="100%" height={220} radius={16} />
          </View>
        </View>
      );
    }
    return (
      <View style={styles.flex}>
        <TopBar title="Lab test" />
        <View style={{ paddingTop: 64 }}>
          <EmptyState icon="Flask" badge={false} title="Test not found" message="It may no longer be offered."
            actionLabel="See lab tests" onAction={() => router.replace('/labs')} />
        </View>
      </View>
    );
  }

  const off = Math.round((1 - p.priceInr / p.mrpInr) * 100);
  const book = () => {
    startDraft({ kind: 'lab', packageId: p.id, memberIds: [memberId] });
    router.push({ pathname: '/book/lab/[packageId]', params: { packageId: p.id } });
  };

  return (
    <View style={styles.flex}>
      <TopBar title={p.kind === 'package' ? 'Package details' : 'Test details'} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.tags}>
            {p.homeCollection ? <Tag label="Home collection" icon="Home" tone="teal" /> : null}
            <Tag label="NABL lab" icon="Shield Tick" />
          </View>
          <Text style={[Type.title, { color: C.text }]} accessibilityRole="header">{p.name}</Text>
          <Text style={[Type.body, { color: C.textSecondary }]}>{p.description}</Text>
          <View style={styles.price} accessible accessibilityLabel={`${inr(p.priceInr)}, was ${inr(p.mrpInr)}, ${off}% off`}>
            <Text style={[Type.title, { color: C.text }]}>{inr(p.priceInr)}</Text>
            <Text style={[Type.body, { color: C.textSecondary, textDecorationLine: 'line-through' }]}>{inr(p.mrpInr)}</Text>
            <Text style={[Type.bodyMedium, { color: C.tealText }]}>{off}% off</Text>
          </View>
        </View>

        <StatTiles items={[
          [p.testsCount === 1 ? 'Test' : 'Tests', String(p.testsCount)],
          ['Report in', `${p.reportHours} hours`],
          // short values: the tile is a third of the width and "Not needed" got cut off
          ['Fasting', p.fastingHours ? `${p.fastingHours} h` : 'None'],
        ]} />

        {p.fastingHours ? (
          <InfoNote tone="amber">
            Fast for {p.fastingHours} hours before the sample is taken. Water is fine. Take your usual medicines unless your doctor says otherwise.
          </InfoNote>
        ) : (
          <InfoNote tone="teal" icon="Tick Circle">No fasting needed. You can eat and drink as usual before the sample.</InfoNote>
        )}

        <View style={{ gap: Space.md }}>
          <Text style={[Type.heading, { color: C.text }]} accessibilityRole="header">
            {p.groups.length > 1 ? 'Tests included' : 'What it checks'}
          </Text>
          <View style={styles.groups}>
            {p.groups.map((g, i) => {
              const isOpen = open === i;
              const more = g.count - g.tests.length;
              // a single test (T3, TSH…) is just a row: no "0 tests" count, no arrow that opens nothing
              const single = !g.tests.length || (g.tests.length === 1 && g.tests[0] === g.name);
              if (single) {
                return (
                  <View key={g.name} style={[styles.groupHead, i > 0 && styles.groupDivider]} accessible accessibilityLabel={g.name}>
                    <Icon name="Tick Circle" size={18} color={C.tealText} />
                    <Text style={[Type.body, { color: C.text, flex: 1 }]}>{g.name}</Text>
                  </View>
                );
              }
              return (
                <View key={g.name} style={i > 0 && styles.groupDivider}>
                  <Pressable onPress={() => setOpen(isOpen ? null : i)} accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }} accessibilityLabel={`${g.name}, ${g.count} test${g.count === 1 ? '' : 's'}`}
                    style={styles.groupHead}>
                    <Text style={[Type.body, { color: C.text, flex: 1 }]}>{g.name}</Text>
                    <Text style={[Type.caption, { color: C.textSecondary }]}>{g.count} test{g.count === 1 ? '' : 's'}</Text>
                    <Icon name={isOpen ? 'Chevron Down' : 'Chevron Right'} size={20} color={C.textSecondary} />
                  </Pressable>
                  {isOpen ? (
                    <View style={styles.items}>
                      {g.tests.map((t) => <Text key={t} style={[Type.body, { color: C.text }]}>•  {t}</Text>)}
                      {more > 0 ? <Text style={[Type.body, { color: C.textSecondary }]}>•  + {more} more</Text> : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <StickyFooter summary={`Report in ${p.reportHours} h · per person`} amount={inr(p.priceInr)}>
        <Button label="Book now" fill style={{ flex: 1 }} onPress={book} />
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.sm, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  card: { backgroundColor: C.card, borderRadius: Radius.card, borderWidth: 1, borderColor: C.border, padding: Space.lg, gap: Space.md },
  tags: { flexDirection: 'row', gap: Space.sm, flexWrap: 'wrap' },
  price: { flexDirection: 'row', alignItems: 'baseline', gap: Space.sm },
  groups: { backgroundColor: C.card, borderRadius: Radius.card, borderWidth: 1, borderColor: C.border, paddingHorizontal: Space.lg },
  groupDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, minHeight: 52 },
  items: { gap: Space.sm, paddingLeft: Space.md, paddingBottom: Space.lg },
});
