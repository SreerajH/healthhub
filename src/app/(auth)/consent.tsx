import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Icon, InfoNote, StickyFooter, useToast } from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { useAuth } from '@/lib/auth';
import { PURPOSES, useSetConsents, type Purpose } from '@/lib/consent';

/** Stand-alone consent, right after the first sign-in and before any health details are collected. */
export default function ConsentScreen() {
  const toast = useToast();
  const { signOut } = useAuth();
  const setConsents = useSetConsents();
  // everything ticked except analytics, which is opt-in
  const [on, setOn] = useState<Set<Purpose>>(new Set(['account', 'family', 'records', 'bookings']));
  const toggle = (p: Purpose) => setOn((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });

  const save = () => {
    setConsents.mutate({ grant: [...on] }, {
      onError: () => toast({ message: 'Couldn’t save your choices. Check your connection and try again.', type: 'error' }),
      // the root layout moves on once the "account" consent exists
    });
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: Space.sm }}>
          <Text style={[Type.title, { color: C.text }]} accessibilityRole="header">Your data, your choice</Text>
          <Text style={[Type.body, { color: C.textSecondary }]}>
            Here&apos;s what HealthHub keeps and why. Choose what you&apos;re happy with — you can change any of this later in Profile → Privacy and data.
          </Text>
        </View>

        {PURPOSES.map((p) => {
          const checked = on.has(p.id);
          return (
            <Pressable
              key={p.id}
              onPress={() => toggle(p.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={`${p.title}${p.required ? ', needed to use HealthHub' : ''}. ${p.what} ${p.why}`}
              style={[styles.card, checked && styles.cardOn]}>
              <View style={[styles.box, checked && styles.boxOn]}>
                {checked ? <Icon name="Tick" size={16} color={C.textInverse} /> : null}
              </View>
              <View style={{ flex: 1, gap: Space.xs }}>
                <Text style={[Type.bodyMedium, { color: C.text }]}>
                  {p.title}{p.required ? <Text style={{ color: C.textSecondary }}>  · Needed</Text> : null}
                </Text>
                <Text style={[Type.caption, { color: C.text }]}>{p.what}</Text>
                <Text style={[Type.caption, { color: C.textSecondary }]}>{p.why}</Text>
              </View>
            </Pressable>
          );
        })}

        <InfoNote tone="navy" icon="Lock">
          We never sell health data. If you leave something unticked, we&apos;ll ask again only when you use that feature.
        </InfoNote>
      </ScrollView>

      <StickyFooter>
        <View style={{ flex: 1, gap: Space.sm }}>
          {!on.has('account') ? (
            <Text style={[Type.caption, { color: C.dangerText, textAlign: 'center' }]}>
              HealthHub can&apos;t work without your account and profile.
            </Text>
          ) : null}
          <Button label="Agree and continue" fill disabled={!on.has('account')} loading={setConsents.isPending} onPress={save} />
          <Button label="Not now, sign out" variant="ghost" fill onPress={signOut} />
        </View>
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.xxl, paddingBottom: Space.xxxl, gap: Space.md, width: '100%', maxWidth: 600, alignSelf: 'center' },
  card: {
    flexDirection: 'row', gap: Space.md, padding: Space.lg, borderRadius: Radius.card,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.card, minHeight: 44,
  },
  cardOn: { borderColor: C.primary },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  boxOn: { backgroundColor: C.primary, borderColor: C.primary },
});
