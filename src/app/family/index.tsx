import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, Avatar, Card, ConfirmDialog, Icon, IconButton, Tag, TopBar, useToast } from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { todayISO, type Member } from '@/data/types';
import { addDays } from '@/lib/booking';
import { ageLabel, firstName, relationLabel } from '@/lib/family';
import { useMembers, useRemoveMember, useReminders } from '@/hooks';

/** Figma "HealthHub / Family": tappable member cards; Edit / Remove live in the ⋯ menu. */
export default function FamilyScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { data: members = [] } = useMembers();
  const removeMember = useRemoveMember();
  const { data: reminders = [] } = useReminders();
  // a dot on the card when a vaccine is due in the next month
  const soon = addDays(todayISO(), 30);
  const vaccineDue = (id: string) => reminders.some((r) => r.memberId === id && r.kind === 'vaccine' && r.startDate <= soon);
  const [menuFor, setMenuFor] = useState<Member | null>(null);
  const [confirm, setConfirm] = useState<Member | null>(null);

  // pairs of cards per row, then the dashed "Add member" card
  const cells: (Member | 'add')[] = [...members, 'add'];
  const rows: (Member | 'add')[][] = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(cells.slice(i, i + 2));

  return (
    <View style={styles.flex}>
      <TopBar title="Family" action={{ icon: 'Plus', label: 'Add family member', onPress: () => router.push('/family/edit') }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Space.xxxl }]}>
        <Text style={[Type.body, { color: C.textSecondary }]}>
          Health profiles for everyone you care for. Tap a card to see their records and bookings.
        </Text>
        {rows.map((row, i) => (
          <View key={i} style={styles.row}>
            {row.map((cell) =>
              cell === 'add' ? (
                <Pressable
                  key="add"
                  onPress={() => router.push('/family/edit')}
                  accessibilityRole="button"
                  accessibilityLabel="Add a family member"
                  style={({ pressed }) => [styles.cell, styles.add, pressed && { opacity: 0.7 }]}>
                  <View style={styles.addCircle}>
                    <Icon name="Plus" size={22} color={C.primary} />
                  </View>
                  <Text style={[Type.bodyMedium, { color: C.primary }]}>Add member</Text>
                </Pressable>
              ) : (
                <MemberCard key={cell.id} m={cell} vaccineDue={vaccineDue(cell.id)} onMenu={() => setMenuFor(cell)} />
              ),
            )}
            {row.length === 1 ? <View style={styles.cell} /> : null}
          </View>
        ))}
      </ScrollView>

      <ActionSheet
        visible={!!menuFor}
        title={menuFor?.name}
        onClose={() => setMenuFor(null)}
        actions={
          menuFor
            ? [
                { label: 'Edit details', icon: 'Edit', onPress: () => router.push({ pathname: '/family/edit', params: { id: menuFor.id } }) },
                ...(menuFor.relation === 'self'
                  ? []
                  : [{ label: 'Remove from family', icon: 'Trash' as const, danger: true, onPress: () => setConfirm(menuFor) }]),
              ]
            : []
        }
      />
      <ConfirmDialog
        visible={!!confirm}
        title={`Remove ${confirm ? firstName(confirm) : ''}?`}
        message={`${confirm ? firstName(confirm) : 'Their'}'s profile, records and reminders will be removed from HealthHub. You can't undo this.`}
        confirmLabel="Remove"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) {
            const name = firstName(confirm);
            removeMember.mutate(confirm.id, {
              onSuccess: () => toast({ message: `${name} was removed` }),
              onError: (e) => toast({ message: e.message, type: 'error' }),
            });
          }
          setConfirm(null);
        }}
      />
    </View>
  );
}

function MemberCard({ m, onMenu, vaccineDue }: { m: Member; onMenu: () => void; vaccineDue: boolean }) {
  return (
    <Card
      style={styles.cell}
      padding={0}
      onPress={() => router.push({ pathname: '/family/[id]', params: { id: m.id } })}
      accessibilityLabel={`${m.name}, ${relationLabel(m)}, ${ageLabel(m.dob)}, blood group ${m.bloodGroup}`}>
      <View style={styles.cardInner}>
        <View style={styles.cardTop}>
          <Avatar name={m.name} tone={m.tone} photo={m.photo} />
          <IconButton icon="More" accessibilityLabel={`More options for ${firstName(m)}`} onPress={onMenu} />
        </View>
        <View style={{ gap: 2 }}>
          <Text style={[Type.subheading, { color: C.text }]} numberOfLines={1}>{m.name}</Text>
          <Text style={[Type.caption, { color: C.textSecondary }]}>
            {relationLabel(m)} · {ageLabel(m.dob)}
          </Text>
        </View>
        <View style={styles.tags}>
          {m.bloodGroup ? <Tag label={m.bloodGroup} icon="Droplet" /> : null}
          {vaccineDue ? <Tag label="Vaccine due" icon="Syringe" tone="amber" /> : null}
          {m.conditions[0] ? <Tag label={shortCondition(m.conditions[0])} icon="Heart Pulse" tone="amber" /> : null}
        </View>
      </View>
    </Card>
  );
}

/** "Type 2 diabetes" → "Diabetes" for the small card tag (the full name shows on member details). */
function shortCondition(c: string) {
  const s = c.replace(/^type \d+\s+/i, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, gap: Space.lg, width: '100%', maxWidth: 600, alignSelf: 'center' },
  row: { flexDirection: 'row', gap: Space.md, alignItems: 'stretch' },
  cell: { flex: 1 },
  cardInner: { padding: Space.lg, paddingRight: Space.sm, gap: Space.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  add: {
    minHeight: 148, borderRadius: Radius.card, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.borderStrong,
    alignItems: 'center', justifyContent: 'center', gap: Space.sm,
  },
  addCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
