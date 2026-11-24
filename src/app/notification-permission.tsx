import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Icon, StickyFooter, useToast, type IconName } from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { useNotificationPermission } from '@/hooks/notifications';
import { markAsked } from '@/lib/local-notifications';

const BENEFITS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'Pill', title: 'The right dose, on time', body: 'A nudge at each medicine time, with Taken and Skip buttons right on the notification.' },
  { icon: 'Calendar Tick', title: 'Visits and tests you won’t miss', body: 'A reminder 24 hours before a doctor visit and again 2 hours before. The evening before a lab test.' },
  { icon: 'Syringe', title: 'Vaccines when they’re due', body: 'A week before, and on the day.' },
];

/**
 * Our own explanation, shown once before the system permission dialog. People say yes far more
 * often when they know what they're agreeing to, and a "no" at the system dialog is hard to undo.
 */
export default function NotificationPermissionScreen() {
  const state = useNotificationPermission((s) => s.state);
  const ask = useNotificationPermission((s) => s.ask);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const blocked = state === 'denied';

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const turnOn = async () => {
    if (blocked) {
      Linking.openSettings().catch(() => toast({ message: 'Open your phone’s Settings to allow notifications', type: 'error' }));
      return;
    }
    setBusy(true);
    const result = await ask();
    setBusy(false);
    if (result === 'granted') {
      toast({ message: 'Reminders are on' });
      close();
    } else {
      // they said no at the system dialog: respect it, and say where to change their mind
      toast({ message: 'No problem. You can turn reminders on later in Profile → Notifications.' });
      close();
    }
  };

  const notNow = async () => {
    await markAsked();
    close();
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.halo} />
          <Icon name="Bell" size={64} color={C.primary} />
        </View>

        <View style={{ gap: Space.sm }}>
          <Text style={[Type.display, styles.center, { color: C.text }]} accessibilityRole="header">
            Never miss a dose or a visit
          </Text>
          <Text style={[Type.body, styles.center, { color: C.textSecondary }]}>
            HealthHub can remind you at the right moment. Reminders are set on this phone, so they work without a connection.
          </Text>
        </View>

        <View style={{ gap: Space.md }}>
          {BENEFITS.map((b) => (
            <View key={b.title} style={styles.row}>
              <View style={styles.icon}><Icon name={b.icon} size={22} color={C.primary} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[Type.subheading, { color: C.text }]}>{b.title}</Text>
                <Text style={[Type.body, { color: C.textSecondary }]}>{b.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={[Type.caption, styles.center, { color: C.textSecondary }]}>
          {blocked
            ? Platform.OS === 'ios'
              ? 'Notifications are switched off for HealthHub. Open Settings → HealthHub → Notifications to turn them on.'
              : 'Notifications are switched off for HealthHub. Open Settings → Apps → HealthHub → Notifications to turn them on.'
            : 'No marketing, ever. You can change this any time in Profile → Notifications.'}
        </Text>
      </ScrollView>

      <StickyFooter>
        <View style={{ flex: 1, gap: Space.sm }}>
          <Button label={blocked ? 'Open Settings' : 'Turn on reminders'} icon="Bell" fill loading={busy} onPress={turnOn} />
          <Button label="Not now" variant="ghost" fill onPress={notNow} />
        </View>
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.xxxl, paddingBottom: Space.xxxl, gap: Space.xxl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  hero: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  halo: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: C.primarySoft },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', gap: Space.md, alignItems: 'flex-start', padding: Space.md, borderRadius: Radius.card, backgroundColor: C.card },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
