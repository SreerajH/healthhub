import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Field, Icon, InfoNote, SettingsScreen, useToast } from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';

const BENEFITS: [string, string][] = [
  ['Hospital records, automatically', 'Prescriptions and discharge summaries from any ABHA hospital land in HealthHub.'],
  ['Lab reports in one place', 'Reports from linked labs arrive without scanning anything.'],
  ['You stay in control', 'Every hospital asks your permission before sharing, and you can unlink at any time.'],
];

/** Figma "HealthHub / Link ABHA": what it is, what it does, and the number entry. */
export default function LinkAbhaScreen() {
  const toast = useToast();
  const [id, setId] = useState('');
  const digits = id.replace(/\D/g, '');
  const valid = digits.length === 14;

  return (
    <SettingsScreen title="Link ABHA">
      <View style={{ gap: Space.sm }}>
        <Text style={[Type.title, { color: C.text }]} accessibilityRole="header">Bring in records from across India</Text>
        <Text style={[Type.body, { color: C.textSecondary }]}>
          ABHA is the government&apos;s health account. Link it and HealthHub can collect records from hospitals and labs that use it.
        </Text>
      </View>

      <View style={{ gap: Space.md }}>
        {BENEFITS.map(([title, body]) => (
          <View key={title} style={styles.benefit}>
            <View style={styles.icon}><Icon name="Tick Circle" size={20} color={C.tealText} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[Type.bodyMedium, { color: C.text }]}>{title}</Text>
              <Text style={[Type.caption, { color: C.textSecondary }]}>{body}</Text>
            </View>
          </View>
        ))}
      </View>

      <Field
        label="ABHA number"
        value={id}
        onChangeText={(v) => setId(v.replace(/[^\d-]/g, '').slice(0, 17))}
        keyboardType="number-pad"
        placeholder="14 digits, e.g. 12-3456-7890-1234"
        helper={valid ? 'Looks right. We\'ll send an OTP to the phone on your ABHA.' : 'Find it in the ABHA app, or on your ABHA card.'}
        error={id && !valid && digits.length > 13 ? 'An ABHA number has 14 digits' : undefined}
      />

      <Button label="Send OTP" disabled={!valid} onPress={() => toast({ message: 'ABHA linking arrives with the health-records integration' })} />

      <InfoNote tone="navy" icon="Lock">
        HealthHub only reads records you approve. Nothing is shared back to ABHA without your permission.
      </InfoNote>
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  benefit: { flexDirection: 'row', gap: Space.md, alignItems: 'flex-start', padding: Space.md, borderRadius: Radius.button, backgroundColor: C.card },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.tealSoft, alignItems: 'center', justifyContent: 'center' },
});
