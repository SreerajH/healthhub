import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, CheckRow, Chip, ChipGroup, DateField, Field, HelperText, TopBar, useToast } from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { ageOf, todayISO, type Member, type Relation } from '@/data/types';
import { firstName } from '@/lib/family';
import { useAddMember, useMember, useUpdateMember } from '@/hooks';
import { useAuth } from '@/lib/auth';
import { useEnsureConsent } from '@/lib/consent';
import { supabase } from '@/lib/supabase';

const RELATIONS: { value: Relation; label: string }[] = [
  { value: 'spouse', label: 'Spouse' }, { value: 'child', label: 'Child' }, { value: 'parent', label: 'Parent' },
  { value: 'sibling', label: 'Sibling' }, { value: 'other', label: 'Other' },
];
const GENDERS: { value: Member['gender']; label: string }[] = [
  { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other', label: 'Other' },
];
const BLOOD = ['A+', 'A−', 'B+', 'B−', 'O+', 'O−', 'AB+', 'AB−', 'Not sure'] as const;

type Form = {
  name: string; relation: Relation | null; dob: string | null; gender: Member['gender'] | null;
  bloodGroup: string; heightCm: string; weightKg: string; allergies: string[]; photo: string | null; guardian: boolean;
};

/** Figma "HealthHub / Edit member" (also adds a member). Save stays disabled until the form is valid. */
export default function EditMemberScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useMember(id);
  const addMember = useAddMember();
  const updateMember = useUpdateMember();
  const today = todayISO();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const isSelf = existing?.relation === 'self';
  const ensureConsent = useEnsureConsent();
  const { user } = useAuth();
  const recordGuardian = (memberId: string) => {
    if (user) supabase.from('consents').insert({ owner_id: user.id, purpose: `guardian:${memberId}` }).then(() => {});
  };

  const [f, setF] = useState<Form>(() => ({
    name: existing?.name ?? '',
    relation: existing?.relation ?? null,
    dob: existing?.dob ?? null,
    gender: existing?.gender ?? null,
    bloodGroup: existing?.bloodGroup ?? '',
    heightCm: existing?.heightCm ? String(existing.heightCm) : '',
    weightKg: existing?.weightKg ? String(existing.weightKg) : '',
    allergies: existing?.allergies ?? [],
    photo: existing?.photo ?? null,
    guardian: !!existing, // consent was given when the member was first added
  }));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [allergyDraft, setAllergyDraft] = useState('');
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  const age = f.dob ? ageOf(f.dob) : null;
  const needsGuardian = !isSelf && age !== null && age < 18 && !existing;

  const errors = useMemo(() => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (f.name.trim().length < 2) e.name = 'Enter their full name';
    if (!isSelf && !f.relation) e.relation = 'Choose how they\'re related to you';
    if (!f.dob) e.dob = 'Choose a date of birth';
    else if (f.dob > today) e.dob = 'Date of birth can\'t be in the future';
    if (!f.gender) e.gender = 'Choose one';
    const h = Number(f.heightCm), w = Number(f.weightKg);
    if (f.heightCm && (!Number.isFinite(h) || h < 30 || h > 250)) e.heightCm = 'Enter a height between 30 and 250 cm';
    if (f.weightKg && (!Number.isFinite(w) || w < 1 || w > 300)) e.weightKg = 'Enter a weight between 1 and 300 kg';
    else if (f.weightKg && age !== null && age < 12 && w > 80) e.weightKg = `That looks too high for age ${age}`;
    if (needsGuardian && !f.guardian) e.guardian = 'Please confirm you\'re their parent or guardian';
    return e;
  }, [f, isSelf, age, needsGuardian, today]);
  const valid = Object.keys(errors).length === 0;
  const show = (k: keyof Form) => (touched[k] ? errors[k] : undefined);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast({ message: 'Allow photo access in Settings to add a picture', type: 'error' });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!res.canceled) set('photo', res.assets[0].uri);
  };

  const addAllergy = () => {
    const a = allergyDraft.trim();
    if (a && !f.allergies.some((x) => x.toLowerCase() === a.toLowerCase())) set('allergies', [...f.allergies, a]);
    setAllergyDraft('');
  };

  const save = async () => {
    if (!valid) return;
    if (!existing && !(await ensureConsent('family'))) return;
    const data = {
      name: f.name.trim().replace(/\s+/g, ' '),
      relation: isSelf ? 'self' as const : (f.relation as Relation),
      dob: f.dob as string,
      gender: f.gender as Member['gender'],
      bloodGroup: f.bloodGroup === 'Not sure' ? '' : f.bloodGroup,
      heightCm: f.heightCm ? Number(f.heightCm) : undefined,
      weightKg: f.weightKg ? Number(f.weightKg) : undefined,
      allergies: f.allergies,
      photo: f.photo,
    };
    if (existing) {
      updateMember.mutate({ id: existing.id, ...data }, {
        onSuccess: () => { toast({ message: 'Changes saved' }); router.back(); },
        onError: (e) => toast({ message: e.message, type: 'error' }),
      });
    } else {
      addMember.mutate({ ...data, conditions: [] }, {
        onSuccess: (m) => {
          // keep a record of who confirmed they're the guardian, and when
          if (needsGuardian) recordGuardian(m.id);
          toast({ message: `${firstName(data)} was added to your family` });
          router.replace({ pathname: '/family/[id]', params: { id: m.id } });
        },
        onError: (e) => toast({ message: e.message, type: 'error' }),
      });
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar title={existing ? (isSelf ? 'Edit your profile' : 'Edit member') : 'Add family member'} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.photoRow}>
          <Avatar name={f.name || undefined} photo={f.photo} tone={existing?.tone ?? 'navy'} size="L" />
          <Button label={f.photo ? 'Change photo' : 'Add photo'} icon="Camera" variant="secondary" size="M" onPress={pickPhoto} />
        </View>

        <Field label="Full name" value={f.name} onChangeText={(v) => set('name', v)} onBlur={() => touch('name')}
          error={show('name')} autoCapitalize="words" autoComplete="name" textContentType="name" placeholder="e.g. Kabir Mehta" />

        {isSelf ? null : (
          <ChipGroup label="Relation" options={RELATIONS} value={f.relation} error={show('relation')}
            onChange={(v) => { set('relation', v); touch('relation'); }} />
        )}

        <DateField label="Date of birth" value={f.dob} error={show('dob')}
          helper={age !== null ? `${firstName({ name: f.name || 'They' })} ${f.name ? 'is' : 'are'} ${age} year${age === 1 ? '' : 's'} old.` : undefined}
          onChange={(v) => { set('dob', v); touch('dob'); }} />

        <ChipGroup label="Gender" options={GENDERS} value={f.gender} error={show('gender')}
          onChange={(v) => { set('gender', v); touch('gender'); }} />

        <ChipGroup label="Blood group" options={BLOOD.map((b) => ({ value: b, label: b }))} value={f.bloodGroup || null}
          onChange={(v) => set('bloodGroup', v)} />

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Field label="Height (cm)" value={f.heightCm} onChangeText={(v) => set('heightCm', v.replace(/[^\d.]/g, ''))}
              onBlur={() => touch('heightCm')} error={show('heightCm')} keyboardType="decimal-pad" placeholder="Optional" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Weight (kg)" value={f.weightKg} onChangeText={(v) => set('weightKg', v.replace(/[^\d.]/g, ''))}
              onBlur={() => touch('weightKg')} error={show('weightKg')} keyboardType="decimal-pad" placeholder="Optional" />
          </View>
        </View>

        <View style={{ gap: Space.sm }}>
          <Text style={[Type.bodyMedium, { color: C.text }]}>Allergies</Text>
          {f.allergies.length ? (
            <View style={styles.chips}>
              {f.allergies.map((a) => (
                <Chip key={a} label={`${a}  ×`} active onPress={() => set('allergies', f.allergies.filter((x) => x !== a))} />
              ))}
            </View>
          ) : (
            <Text style={[Type.caption, { color: C.textSecondary }]}>None added. Tap an allergy to remove it.</Text>
          )}
          <View style={styles.allergyRow}>
            <TextInput
              value={allergyDraft}
              onChangeText={setAllergyDraft}
              onSubmitEditing={addAllergy}
              placeholder="Add an allergy, e.g. Penicillin"
              placeholderTextColor={C.textSecondary}
              returnKeyType="done"
              accessibilityLabel="New allergy"
              style={[Type.body, styles.allergyInput]}
            />
            <Button label="Add" variant="secondary" size="M" onPress={addAllergy} disabled={!allergyDraft.trim()} />
          </View>
        </View>

        {needsGuardian ? (
          <View style={{ gap: Space.xs }}>
            <CheckRow checked={f.guardian} onToggle={() => { set('guardian', !f.guardian); touch('guardian'); }}>
              I&apos;m {f.name ? firstName(f) + '\'s' : 'their'} parent or legal guardian, and I agree to store their health information in HealthHub.
            </CheckRow>
            <HelperText error={show('guardian')} />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Space.md }]}>
        {!valid ? (
          <Text style={[Type.caption, { color: C.textSecondary, textAlign: 'center' }]} accessibilityLiveRegion="polite">
            Still needed: {missingList(errors)}
          </Text>
        ) : null}
        <Button label={existing ? 'Save changes' : 'Add member'} onPress={save} disabled={!valid} fill />
      </View>
    </KeyboardAvoidingView>
  );
}

const MISSING_LABEL: Partial<Record<keyof Form, string>> = {
  name: 'name', relation: 'relation', dob: 'date of birth', gender: 'gender',
  heightCm: 'a valid height', weightKg: 'a valid weight', guardian: 'guardian consent',
};
/** "name, gender and guardian consent" */
function missingList(errors: Partial<Record<keyof Form, string>>) {
  const items = (Object.keys(errors) as (keyof Form)[]).map((k) => MISSING_LABEL[k] ?? k);
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0];
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: Space.lg },
  twoCol: { flexDirection: 'row', gap: Space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Space.sm },
  allergyRow: { flexDirection: 'row', gap: Space.sm, alignItems: 'center' },
  allergyInput: {
    flex: 1, height: 44, borderRadius: Radius.button, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.card,
    paddingHorizontal: Space.md, color: C.text, outlineWidth: 0,
  },
  footer: {
    paddingHorizontal: Space.screen, paddingTop: Space.md, gap: Space.sm, backgroundColor: C.card,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
  },
});
