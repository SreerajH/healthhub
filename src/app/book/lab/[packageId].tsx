import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, EmptyState, Field, SelectCard, StickyFooter, TopBar, useToast } from '@/components/healthhub';
import { C, Space, Type } from '@/constants/healthhub';
import { inr } from '@/data/types';
import { useLabPackage, useMembers } from '@/hooks';
import { eligibility, useAddresses, useDraft } from '@/lib/booking';
import { ageLabel, relationLabel } from '@/lib/family';

/** Figma "HealthHub / Members and address": who's being tested, where to collect the sample. */
export default function LabMembersScreen() {
  const { packageId } = useLocalSearchParams<{ packageId: string }>();
  const { data: p } = useLabPackage(packageId);
  const { data: members = [] } = useMembers();
  const { addresses, add } = useAddresses();
  const draft = useDraft();
  const toast = useToast();

  const sameFlow = draft.kind === 'lab' && draft.packageId === packageId;
  const [picked, setPicked] = useState<string[]>(() =>
    p ? (sameFlow ? draft.memberIds : []).filter((id) => { const m = members.find((x) => x.id === id); return m && eligibility(p, m).ok; }) : []);
  const [addressId, setAddressId] = useState(() => (sameFlow && draft.addressId) || addresses[0]?.id);
  const [adding, setAdding] = useState(false);
  const [newLine, setNewLine] = useState('');
  const [newLabel, setNewLabel] = useState('');

  if (!p) {
    return (
      <View style={styles.flex}>
        <TopBar title="Who's it for?" />
        <View style={{ paddingTop: 64 }}>
          <EmptyState icon="Flask" badge={false} title="Test not found" message="Choose a lab test to book."
            actionLabel="See lab tests" onAction={() => router.replace('/labs')} />
        </View>
      </View>
    );
  }

  const toggle = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const saveAddress = () => {
    const line = newLine.trim();
    if (line.length < 10) return toast({ message: 'Enter the full address, with area and pincode', type: 'error' });
    const area = line.split(',').map((s) => s.trim()).filter(Boolean).slice(-2, -1)[0] ?? '';
    const id = add({ label: newLabel.trim() || 'Other', line, area });
    setAddressId(id);
    setAdding(false); setNewLine(''); setNewLabel('');
  };
  const next = () => {
    if (!picked.length || !addressId) return;
    draft.start({ kind: 'lab', packageId: p.id, memberIds: picked, addressId, at: sameFlow ? draft.at : undefined, payment: draft.payment });
    router.push('/book/lab/slot');
  };

  const n = picked.length;
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar title="Who's it for?" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={{ gap: Space.sm }}>
          <Text style={[Type.body, { color: C.textSecondary }]}>{p.name} · {inr(p.priceInr)} per person</Text>
          {members.map((m) => {
            const e = eligibility(p, m);
            const sub = [relationLabel(m), ageLabel(m.dob), e.note].filter(Boolean).join(' · ');
            return (
              <SelectCard key={m.id} control="check" selected={picked.includes(m.id)} onPress={() => toggle(m.id)} disabled={!e.ok}
                title={m.name} subtitle={sub} leading={<Avatar name={m.name} photo={m.photo} tone={m.tone} size="S" />} />
            );
          })}
        </View>

        <View style={{ gap: Space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Sample collection address">
          <Text style={[Type.subheading, { color: C.text }]}>Sample collection address</Text>
          {addresses.map((a) => (
            <SelectCard key={a.id} control="radio" selected={a.id === addressId} onPress={() => setAddressId(a.id)}
              icon={a.label === 'Home' ? 'Home' : a.label === 'Office' ? 'Hospital' : 'Location'} title={a.label} subtitle={a.line} />
          ))}
          {adding ? (
            <View style={styles.newAddress}>
              <Field label="Address" value={newLine} onChangeText={setNewLine} autoFocus multiline
                placeholder="House no., street, area, city, pincode" style={{ height: 88, paddingTop: 14, textAlignVertical: 'top' }} />
              <Field label="Save as (optional)" value={newLabel} onChangeText={setNewLabel} placeholder="e.g. Parents' home" maxLength={24} />
              <View style={{ flexDirection: 'row', gap: Space.md }}>
                <Button label="Cancel" variant="secondary" size="M" fill style={{ flex: 1 }} onPress={() => setAdding(false)} />
                <Button label="Save address" size="M" fill style={{ flex: 1 }} onPress={saveAddress} disabled={!newLine.trim()} />
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row' }}>
              <Button label="Add a new address" icon="Plus" variant="ghost" size="M" onPress={() => setAdding(true)} />
            </View>
          )}
        </View>
      </ScrollView>

      <StickyFooter summary={n ? `${n} ${n === 1 ? 'person' : 'people'}` : 'Choose who to test'} amount={n ? inr(p.priceInr * n) : undefined}>
        <Button label="Choose a time" fill style={{ flex: 1 }} onPress={next} disabled={!n || !addressId} />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.sm, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  newAddress: { gap: Space.lg, padding: Space.lg, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
});
