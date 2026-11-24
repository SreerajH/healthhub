import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, ChipGroup, DateField, Field, StickyFooter, useToast } from '@/components/healthhub';
import { C, Space, Type } from '@/constants/healthhub';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Enums } from '@/types/database';

const TODAY = new Date().toISOString().slice(0, 10);
const GENDERS: { value: Enums<'gender'> | 'unsaid'; label: string }[] = [
  { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' }, { value: 'unsaid', label: 'Prefer not to say' },
];

/** Figma "HealthHub / Create profile": the account holder's own health profile, right after the first sign-in. */
export default function CreateProfileScreen() {
  const { user, refreshProfile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [dob, setDob] = useState<string | null>(null);
  const [gender, setGender] = useState<Enums<'gender'> | 'unsaid' | null>(null);
  const [email, setEmail] = useState(user?.email ?? '');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = 'Enter your full name';
    if (!dob) e.dob = 'Choose your date of birth';
    else if (dob > TODAY) e.dob = 'Date of birth can\'t be in the future';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) e.email = 'Check this email address';
    return e;
  }, [name, dob, email]);
  const valid = !Object.keys(errors).length;
  const show = (k: string) => (touched ? errors[k] : undefined);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast({ message: 'Allow photo access in Settings to add a picture', type: 'error' });
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!res.canceled) setPhoto(res.assets[0].uri);
  };

  const save = async () => {
    setTouched(true);
    if (!valid || !user || busy) return;
    setBusy(true);

    const fullName = name.trim().replace(/\s+/g, ' ');
    const { error: profileError } = await supabase.from('profiles')
      .upsert({ id: user.id, full_name: fullName, phone: user.phone ?? null }, { onConflict: 'id' });

    if (profileError) {
      setBusy(false);
      toast({ message: profileError.message, type: 'error' });
      return;
    }

    // the signup trigger only creates the "self" member when the name was known at signup,
    // so create or complete it here
    const { data: existing } = await supabase.from('family_members')
      .select('id').eq('owner_id', user.id).eq('relation', 'self').maybeSingle();

    const member = {
      full_name: fullName,
      dob: dob!,
      gender: gender && gender !== 'unsaid' ? gender : null,
    };
    const { error: memberError } = existing
      ? await supabase.from('family_members').update(member).eq('id', existing.id)
      : await supabase.from('family_members').insert({ ...member, owner_id: user.id, relation: 'self' });

    if (memberError) {
      setBusy(false);
      toast({ message: memberError.message, type: 'error' });
      return;
    }

    if (email.trim() && email.trim() !== user.email) {
      // a change of email needs its own confirmation, so don't block the sign-up on it
      supabase.auth.updateUser({ email: email.trim() }).catch(() => {});
    }

    await refreshProfile();
    setBusy(false);
    // the root layout moves on to the app as soon as the profile has a name
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={{ gap: Space.sm }}>
          <Text style={[Type.title, { color: C.text }]} accessibilityRole="header">Tell us about you</Text>
          <Text style={[Type.body, { color: C.textSecondary }]}>
            This is your own health profile. You can add family next.
          </Text>
        </View>

        <View style={styles.photoRow}>
          <Avatar name={name || undefined} photo={photo} tone="navy" size="L" />
          <Button label={photo ? 'Change photo' : 'Add photo'} icon="Camera" variant="secondary" size="M" onPress={pickPhoto} />
        </View>

        <Field label="Full name" value={name} onChangeText={setName} error={show('name')}
          autoCapitalize="words" autoComplete="name" textContentType="name" placeholder="e.g. Aarav Mehta" />

        <DateField label="Date of birth" value={dob} error={show('dob')} onChange={setDob} />

        <ChipGroup label="Gender" options={GENDERS} value={gender} onChange={setGender} />

        <Field label="Email (optional)" value={email} onChangeText={setEmail} error={show('email')}
          helper="For receipts and report copies." keyboardType="email-address" autoCapitalize="none"
          autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" />
      </ScrollView>

      <StickyFooter>
        <Button label="Save and continue" fill style={{ flex: 1 }} loading={busy} onPress={save} />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.xxl, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: Space.lg },
});
