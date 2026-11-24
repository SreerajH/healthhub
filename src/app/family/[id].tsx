import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Card, ComingUpCard, EmptyState, ListRow, SectionHeader, Tag, TopBar, useToast } from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { useBookings, useComingUp, useMember, useRecords, useReminders } from '@/hooks';
import { dateLabel } from '@/lib/dates';
import { ageLabel, firstName, relationLabel } from '@/lib/family';
import { useSelectedMember } from '@/lib/selected-member';

/** Figma "HealthHub / Member details". */
export default function MemberDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const m = useMember(id);
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const select = useSelectedMember((s) => s.select);
  const { data: records = [] } = useRecords();
  const { data: reminders = [] } = useReminders();
  const { appointments, labBookings } = useBookings();
  const { items: comingUp } = useComingUp(id);

  if (!m) {
    return (
      <View style={styles.flex}>
        <TopBar title="Family member" />
        <View style={{ paddingTop: 64 }}>
          <EmptyState icon="People" title="Member not found" message="They may have been removed from your family." badge={false}
            actionLabel="Back to family" onAction={() => router.replace('/family')} />
        </View>
      </View>
    );
  }

  const first = firstName(m);
  const nRecords = records.filter((r) => r.memberId === m.id).length;
  const nBookings = appointments.filter((a) => a.memberId === m.id && a.status === 'upcoming').length + labBookings.filter((l) => l.memberIds.includes(m.id) && l.status === 'upcoming').length;
  const meds = reminders.filter((r) => r.memberId === m.id && r.kind === 'medicine');
  const nReminders = reminders.filter((r) => r.memberId === m.id).length;
  const next = comingUp[0];

  return (
    <View style={styles.flex}>
      <TopBar title={m.name} action={{ icon: 'Edit', label: `Edit ${first}'s details`, onPress: () => router.push({ pathname: '/family/edit', params: { id: m.id } }) }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Space.xxxl }]}>
        <View style={styles.header}>
          <Avatar name={m.name} tone={m.tone} photo={m.photo} size="L" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[Type.title, { color: C.text }]} accessibilityRole="header">{m.name}</Text>
            <Text style={[Type.caption, { color: C.textSecondary }]}>
              {relationLabel(m)} · {ageLabel(m.dob)} · Born {dateLabel(m.dob)}
            </Text>
          </View>
        </View>

        <View style={styles.stats}>
          <Stat label="Blood group" value={m.bloodGroup || '—'} />
          <Stat label="Height" value={m.heightCm ? `${m.heightCm} cm` : '—'} />
          <Stat label="Weight" value={m.weightKg ? `${m.weightKg} kg` : '—'} />
        </View>

        <Card>
          <View style={{ gap: Space.lg }}>
            <InfoBlock title="Allergies">
              {m.allergies.length ? (
                <View style={styles.tags}>{m.allergies.map((a) => <Tag key={a} label={a} icon="Warning" tone="red" />)}</View>
              ) : <None />}
            </InfoBlock>
            <InfoBlock title="Conditions">
              {m.conditions.length ? (
                <View style={styles.tags}>{m.conditions.map((c) => <Tag key={c} label={c} icon="Heart Pulse" tone="amber" />)}</View>
              ) : <None />}
            </InfoBlock>
            <InfoBlock title="Current medicines">
              {meds.length ? meds.map((r) => (
                <Text key={r.id} style={[Type.body, { color: C.text }]}>{r.name} · {r.dose}{r.note ? ` · ${r.note}` : ''}</Text>
              )) : <None />}
            </InfoBlock>
          </View>
        </Card>

        {next ? (
          <View style={{ gap: Space.md }}>
            <SectionHeader title="Coming up" />
            <ComingUpCard item={next} member={m} onPress={() => toast({ message: `${next.title} opens in a later build step` })} onAction={() => toast({ message: `${next.action.label} opens in a later build step` })} />
          </View>
        ) : null}

        <View style={{ gap: Space.sm }}>
          <Text style={[Type.bodyMedium, { color: C.textSecondary }]}>{first}&apos;s health</Text>
          <View style={styles.group}>
            <ListRow icon="Document" label="Records" value={`${nRecords} record${nRecords === 1 ? '' : 's'}`}
              onPress={() => router.push({ pathname: '/records', params: { member: m.id } })} />
            <ListRow icon="Calendar Tick" label="Bookings" value={nBookings ? `${nBookings} upcoming` : 'None upcoming'}
              onPress={() => { select(m.id); router.push('/bookings'); }} />
            <ListRow icon="Alarm" label="Reminders" value={`${nReminders} active`} divider={false}
              onPress={() => toast({ message: 'Reminders arrive in a later build step' })} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[Type.micro, { color: C.textSecondary }]}>{label}</Text>
      <Text style={[Type.subheading, { color: C.text }]}>{value}</Text>
    </View>
  );
}
function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: Space.sm }}>
      <Text style={[Type.bodyMedium, { color: C.textSecondary }]}>{title}</Text>
      {children}
    </View>
  );
}
const None = () => <Text style={[Type.body, { color: C.text }]}>None recorded</Text>;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, gap: Space.xxl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Space.lg },
  stats: { flexDirection: 'row', gap: Space.sm },
  stat: { flex: 1, padding: Space.md, borderRadius: Radius.button, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, gap: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  group: { borderRadius: Radius.card, borderWidth: 1, borderColor: C.border, overflow: 'hidden', backgroundColor: C.card },
});
