import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Avatar, Button, Chip, ChipRow, EmptyState, ErrorState, Icon, SectionHeader, Skeleton, StatusPill, Tag, TopBar, useToast,
} from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { todayISO, type Reminder } from '@/data/types';
import { dayLabel, daysFromToday, timeLabel } from '@/lib/dates';
import { firstName } from '@/lib/family';
import { useMembers , useClearDose, useDoseLog, useLogDose, useReminders } from '@/hooks';

import { dosesFor, notYet, repeatLabel, streakFor, takeFrom as earliest, vaccinesFor, type Dose } from '@/lib/reminder-schedule';

/** "After breakfast" → "after breakfast", without touching names like "Tuesdays". */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Figma "HealthHub / Reminders": today's doses with Taken / Skip, the streak, and upcoming vaccines. */
export default function RemindersScreen() {
  const { data: reminders = [], isLoading, error, refetch } = useReminders();
  const { data: doses = {} } = useDoseLog();
  const logDose = useLogDose();
  const clearDose = useClearDose();
  const { data: members = [] } = useMembers();
  const toast = useToast();
  const [memberId, setMemberId] = useState<string | 'all'>('all');

  const today = useMemo(() => dosesFor(reminders, doses, memberId), [reminders, doses, memberId]);
  const vaccines = useMemo(() => vaccinesFor(reminders, memberId), [reminders, memberId]);
  const streak = useMemo(() => streakFor(reminders, doses, memberId), [reminders, doses, memberId]);
  const nameOf = (r: Reminder) => { const m = members.find((x) => x.id === r.memberId); return m ? firstName(m) : ''; };

  const act = (dose: Dose, state: 'taken' | 'skipped') => {
    logDose.mutate({ key: dose.key, state });
    toast({
      message: state === 'taken' ? `${dose.reminder.name} marked as taken` : `${dose.reminder.name} skipped`,
      actionLabel: 'Undo',
      onAction: () => clearDose.mutate(dose.key),
    });
  };

  const empty = !today.length && !vaccines.length;

  return (
    <View style={styles.flex}>
      <TopBar title="Reminders" action={{ icon: 'Plus', label: 'Add a reminder', onPress: () => router.push('/reminders/new') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ChipRow label="Filter by family member">
          <Chip label="Everyone" active={memberId === 'all'} onPress={() => setMemberId('all')} />
          {members.map((m) => (
            <Chip key={m.id} label={m.relation === 'self' ? 'You' : firstName(m)} active={memberId === m.id} onPress={() => setMemberId(m.id)} />
          ))}
        </ChipRow>

        {error ? (
          <View style={{ paddingTop: Space.xxl }}><ErrorState message={error.message} onRetry={() => refetch()} /></View>
        ) : null}

        {isLoading ? (
          <View style={{ gap: Space.md }} accessibilityLabel="Loading reminders">
            {[0, 1].map((i) => <Skeleton key={i} width="100%" height={120} radius={16} />)}
          </View>
        ) : null}

        {empty && !isLoading && !error ? (
          <View style={{ paddingTop: Space.xxl }}>
            <EmptyState icon="Alarm" title="No reminders yet"
              message="Add a medicine or vaccine and HealthHub will remind you at the right time."
              actionLabel="Add a reminder" actionIcon="Plus" onAction={() => router.push('/reminders/new')} />
          </View>
        ) : null}

        {streak.days > 1 ? (
          <View style={styles.streak}>
            <View style={styles.streakIcon}><Icon name="Heart Pulse" size={22} color={C.tealText} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[Type.subheading, { color: C.tealText }]}>{streak.days}-day streak</Text>
              <Text style={[Type.caption, { color: C.tealText }]}>
                {memberId === 'all' ? 'No doses missed' : `${members.find((m) => m.id === memberId)?.name.split(' ')[0]} hasn't missed a dose`}
                {streak.since ? ` since ${dayLabel(streak.since)}.` : '.'}
              </Text>
            </View>
          </View>
        ) : null}

        {today.length ? (
          <View style={{ gap: Space.md }}>
            <Text style={[Type.heading, { color: C.text }]} accessibilityRole="header">Today · {dayLabel(todayISO())}</Text>
            <View style={styles.doseCard}>
              {today.map((dose, i) => (
                <View key={dose.key} style={[styles.dose, i > 0 && styles.divider]}>
                  <Text style={[Type.caption, { color: C.textSecondary, width: 64 }]}>{timeLabel(dose.time)}</Text>
                  <View style={{ flex: 1, gap: Space.sm }}>
                    <View style={{ gap: 2 }}>
                      <Text style={[Type.subheading, { color: C.text }]}>{dose.reminder.name}</Text>
                      <Text style={[Type.caption, { color: C.textSecondary }]}>
                        {dose.reminder.dose}{dose.reminder.note ? `, ${lowerFirst(dose.reminder.note)}` : ''}
                        {memberId === 'all' ? ` · ${nameOf(dose.reminder)}` : ''}
                      </Text>
                    </View>
                    {dose.state ? (
                      <View style={{ flexDirection: 'row' }}>
                        <Tag label={dose.state === 'taken' ? `Taken at ${timeLabel(dose.at ?? dose.time)}` : 'Skipped'}
                          icon={dose.state === 'taken' ? 'Tick Circle' : 'Close'} tone={dose.state === 'taken' ? 'teal' : 'navy'} />
                      </View>
                    ) : notYet(dose.time) ? (
                      // a 9 PM dose can't be "taken" at noon: offer it from an hour before
                      <View style={{ flexDirection: 'row' }}>
                        <Tag label={`Upcoming · from ${timeLabel(earliest(dose.time))}`} icon="Clock" tone="navy" />
                      </View>
                    ) : (
                      <View style={{ gap: Space.sm }}>
                      {/* its own line: on a phone, Overdue + Taken + Skip don't fit side by side */}
                      {dose.missed ? (
                        <View style={{ flexDirection: 'row' }}>
                          <Tag label="Overdue" icon="Warning" tone="amber" />
                        </View>
                      ) : null}
                      <View style={styles.doseActions}>
                        <Button label="Taken" icon="Tick" variant="positive" size="M" onPress={() => act(dose, 'taken')}
                          accessibilityLabel={`Mark ${dose.reminder.name} at ${timeLabel(dose.time)} as taken`} />
                        <Pressable onPress={() => act(dose, 'skipped')} accessibilityRole="button"
                          accessibilityLabel={`Skip ${dose.reminder.name} at ${timeLabel(dose.time)}`} style={styles.skip}>
                          <Text style={[Type.bodyMedium, { color: C.primary }]}>Skip</Text>
                        </Pressable>
                      </View>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {vaccines.length ? (
          <View style={{ gap: Space.md }}>
            <SectionHeader title="Vaccines" />
            {vaccines.map((v) => {
              const days = daysFromToday(v.startDate);
              const soon = days >= 0 && days <= 30;
              const m = members.find((x) => x.id === v.memberId);
              return (
                <View key={v.id} style={styles.vaccine}>
                  <View style={styles.vaccineTop}>
                    <View style={styles.vaccineIcon}><Icon name="Syringe" size={22} color={C.warningText} /></View>
                    <View style={{ flex: 1, gap: 2 }}>
                      {soon ? (
                        <View style={{ flexDirection: 'row' }}>
                          <StatusPill status="dueSoon" label={days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`} />
                        </View>
                      ) : null}
                      <Text style={[Type.subheading, { color: C.text }]}>{v.name}</Text>
                      <Text style={[Type.caption, { color: C.textSecondary }]}>{v.note}</Text>
                      <Text style={[Type.caption, { color: C.textSecondary }]}>
                        {m ? firstName(m) : ''} · Due {dayLabel(v.startDate)}
                      </Text>
                    </View>
                    {m ? <Avatar name={m.name} photo={m.photo} tone={m.tone} size="S" /> : null}
                  </View>
                  {soon ? (
                    <Button label="Book vaccine" icon="Calendar" variant="secondary" size="M" fill
                      onPress={() => router.push({ pathname: '/doctors', params: { specialty: 'paeds' } })} />
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {!empty ? (
          <View style={{ gap: Space.md }}>
            <SectionHeader title="All reminders" />
            {reminders
              .filter((r) => memberId === 'all' || r.memberId === memberId)
              .map((r) => (
                <View key={r.id} style={styles.listRow}>
                  <Icon name={r.kind === 'vaccine' ? 'Syringe' : 'Pill'} size={22} color={C.textSecondary} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[Type.bodyMedium, { color: C.text }]}>{r.name}</Text>
                    <Text style={[Type.caption, { color: C.textSecondary }]}>
                      {nameOf(r)} · {r.kind === 'vaccine' ? `Due ${dayLabel(r.startDate)}` : `${repeatLabel(r.days)} · ${r.times.map(timeLabel).join(', ')}`}
                    </Text>
                  </View>
                </View>
              ))}
            <Button label="Add a reminder" icon="Plus" variant="secondary" onPress={() => router.push('/reminders/new')} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.sm, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.lg, borderRadius: Radius.card, backgroundColor: C.tealSoft },
  streakIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  doseCard: { backgroundColor: C.card, borderRadius: Radius.card, borderWidth: 1, borderColor: C.border, paddingHorizontal: Space.lg },
  dose: { flexDirection: 'row', gap: Space.sm, paddingVertical: Space.lg },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  doseActions: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  skip: { minHeight: 44, paddingHorizontal: Space.md, justifyContent: 'center' },
  vaccine: { backgroundColor: C.card, borderRadius: Radius.card, borderWidth: 1, borderColor: C.border, padding: Space.lg, gap: Space.md },
  vaccineTop: { flexDirection: 'row', gap: Space.md, alignItems: 'flex-start' },
  vaccineIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.warningSoft, alignItems: 'center', justifyContent: 'center' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.md, borderRadius: Radius.button, backgroundColor: C.card },
});
