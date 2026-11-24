import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import {
  Button, Chip, ChipGroup, DateField, Field, Segmented, StickyFooter, TimeChip, TopBar, useToast,
} from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { todayISO } from '@/data/types';
import { timeLabel } from '@/lib/dates';
import { firstName } from '@/lib/family';
import { useAddReminder, useMembers } from '@/hooks';
import { offerNotifications } from '@/hooks/notifications';

import { DAY_SHORT, repeatLabel, WHEN_PRESETS } from '@/lib/reminder-schedule';
import { useSelectedMember } from '@/lib/selected-member';

const EXTRA_TIMES = ['06:00', '10:00', '12:00', '16:00', '18:00', '23:00'];

/** Figma "HealthHub / Add reminder": medicine or vaccine, for whom, when and how often. */
export default function NewReminderScreen() {
  const { data: members = [] } = useMembers();
  const selected = useSelectedMember((s) => s.memberId);
  const addReminder = useAddReminder();
  const toast = useToast();

  const [kind, setKind] = useState<'medicine' | 'vaccine'>('medicine');
  const [memberId, setMemberId] = useState(selected);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [when, setWhen] = useState<string[]>([]);
  const [times, setTimes] = useState<string[]>([]);
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const today = todayISO();
  const [start, setStart] = useState<string | null>(today);
  const [end, setEnd] = useState<string | null>(null);
  const [refill, setRefill] = useState(true);
  const [touched, setTouched] = useState(false);

  const toggleTime = (t: string) => setTimes((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t].sort()));
  const togglePreset = (label: string) => {
    const preset = WHEN_PRESETS.find((p) => p.label === label)!;
    const on = when.includes(label);
    setWhen((x) => (on ? x.filter((y) => y !== label) : [...x, label]));
    setTimes((x) => (on ? x.filter((t) => t !== preset.time) : [...x, preset.time].sort()));
  };
  const toggleDay = (d: number) => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort()));

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = kind === 'medicine' ? 'Enter the medicine name' : 'Enter the vaccine name';
    if (!start) e.start = 'Choose a start date';
    if (kind === 'medicine') {
      if (!times.length) e.times = 'Choose at least one time';
      if (!days.length) e.days = 'Choose at least one day';
      if (end && start && end < start) e.end = 'The end date is before the start date';
    } else if (start && start < today) e.start = 'A vaccine due date can\'t be in the past';
    return e;
  }, [name, kind, times, days, start, end, today]);
  const valid = !Object.keys(errors).length;

  const save = async () => {
    setTouched(true);
    if (!valid) return;
    const m = members.find((x) => x.id === memberId);
    await addReminder.mutateAsync({
      memberId, kind,
      name: name.trim(),
      dose: dose.trim() || (kind === 'vaccine' ? '1 dose' : '1 tablet'),
      times: kind === 'vaccine' ? ['10:00'] : times,
      days: kind === 'vaccine' ? [] : days,
      startDate: start!,
      endDate: kind === 'medicine' ? end : null,
      note: kind === 'medicine' ? (when.length ? when.join(' and ') : repeatLabel(days)) : undefined,
    });
    toast({ message: `Reminder added${m ? ` for ${firstName(m)}` : ''}` });
    router.back();
    // a reminder is only useful if it can reach them: explain, once, before the system dialog
    setTimeout(offerNotifications, 400);
  };

  const show = (k: string) => (touched ? errors[k] : undefined);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar title="Add a reminder" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Segmented options={[{ value: 'medicine', label: 'Medicine' }, { value: 'vaccine', label: 'Vaccine' }]} value={kind} onChange={setKind} />

        <ChipGroup label="For" options={members.map((m) => ({ value: m.id, label: m.relation === 'self' ? 'You' : firstName(m) }))}
          value={memberId} onChange={setMemberId} />

        <Field label={kind === 'medicine' ? 'Medicine name' : 'Vaccine name'} value={name} onChangeText={setName}
          error={show('name')} autoCapitalize="sentences" maxLength={60}
          placeholder={kind === 'medicine' ? 'e.g. Metformin 500 mg' : 'e.g. Flu vaccine'} />

        <Field label="Dose" value={dose} onChangeText={setDose} maxLength={40}
          placeholder={kind === 'medicine' ? 'e.g. 1 tablet' : 'e.g. 1 dose'} />

        {kind === 'medicine' ? (
          <>
            <View style={{ gap: Space.xs }}>
              <Text style={[Type.bodyMedium, { color: C.text }]}>When</Text>
              <View style={styles.chips}>
                {WHEN_PRESETS.map((p) => (
                  <Chip key={p.label} label={p.label} active={when.includes(p.label)} onPress={() => togglePreset(p.label)} />
                ))}
              </View>
            </View>

            <View style={{ gap: Space.xs }} accessibilityLabel="Remind me at">
              <Text style={[Type.bodyMedium, { color: C.text }]}>Remind me at</Text>
              <View style={styles.chips}>
                {[...new Set([...times, ...EXTRA_TIMES])].sort().map((t) => (
                  <Chip key={t} label={timeLabel(t)} active={times.includes(t)} onPress={() => toggleTime(t)} />
                ))}
                <TimeChip onPick={(t) => setTimes((x) => (x.includes(t) ? x : [...x, t].sort()))} />
              </View>
              {show('times') ? <Text style={[Type.caption, { color: C.dangerText }]}>{errors.times}</Text> : null}
            </View>

            <View style={{ gap: Space.sm }} accessibilityLabel="Repeat">
              <Text style={[Type.bodyMedium, { color: C.text }]}>Repeat</Text>
              <View style={styles.days}>
                {/* Monday first, the way an Indian calendar reads; the values stay 0 = Sunday */}
                {[1, 2, 3, 4, 5, 6, 0].map((i) => {
                  const label = DAY_SHORT[i];
                  const on = days.includes(i);
                  return (
                    <Pressable key={label} onPress={() => toggleDay(i)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                      accessibilityLabel={label} style={[styles.day, on && styles.dayOn]}>
                      <Text style={[Type.bodyMedium, { color: on ? C.textInverse : C.text }]}>{label[0]}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[Type.caption, { color: show('days') ? C.dangerText : C.textSecondary }]}>
                {show('days') ?? repeatLabel(days)}
              </Text>
            </View>
          </>
        ) : null}

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <DateField label={kind === 'medicine' ? 'Starts' : 'Due date'} value={start} error={show('start')}
              maximumDate={kind === 'vaccine' ? undefined : new Date()} onChange={setStart} />
          </View>
          {kind === 'medicine' ? (
            <View style={{ flex: 1 }}>
              <DateField label="Ends" value={end} error={show('end')} maximumDate={undefined}
                helper={end ? undefined : 'Ongoing'} onChange={setEnd} />
            </View>
          ) : null}
        </View>

        {kind === 'medicine' ? (
          <View style={styles.refill}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[Type.bodyMedium, { color: C.text }]}>Remind me to refill</Text>
              <Text style={[Type.caption, { color: C.textSecondary }]}>When about 5 tablets are left</Text>
            </View>
            <Switch value={refill} onValueChange={setRefill} accessibilityLabel="Remind me to refill"
              trackColor={{ true: C.primary, false: C.border }} thumbColor={C.card} />
          </View>
        ) : null}
      </ScrollView>

      <StickyFooter>
        <Button label="Save reminder" fill style={{ flex: 1 }} onPress={save} disabled={touched && !valid} />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.sm, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Space.sm },
  days: { flexDirection: 'row', gap: Space.sm },
  day: { flex: 1, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: C.primary, borderColor: C.primary },
  twoCol: { flexDirection: 'row', gap: Space.md },
  refill: {
    flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.lg, borderRadius: Radius.card,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
});
