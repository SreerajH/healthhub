import { Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { Button, InfoNote, SettingsGroup, SettingsScreen, SwitchRow } from '@/components/healthhub';
import { C, Space, Type } from '@/constants/healthhub';
import { useNotificationPermission } from '@/hooks/notifications';
import { useNotificationPrefs } from '@/lib/notification-prefs';

const SETTINGS = [
  { key: 'appointments', label: 'Appointment reminders', description: '24 hours and 2 hours before a visit; the evening before a lab test' },
  { key: 'medicines', label: 'Medicine reminders', description: 'At each dose time you set, with Taken and Skip buttons' },
  { key: 'vaccines', label: 'Vaccine due dates', description: 'A week before, and on the day' },
] as const;

/** Profile → Notifications: what HealthHub may remind you about, and whether the phone allows it. */
export default function NotificationSettingsScreen() {
  const prefs = useNotificationPrefs();
  const state = useNotificationPermission((s) => s.state);
  const ask = useNotificationPermission((s) => s.ask);

  return (
    <SettingsScreen title="Notifications">
      {Platform.OS === 'web' ? (
        <InfoNote tone="navy" icon="Bell">
          Reminders are delivered by the HealthHub app on your phone. They aren&apos;t available in a web browser.
        </InfoNote>
      ) : state === 'granted' ? null : (
        <View style={styles.banner}>
          <Text style={[Type.subheading, { color: C.warningText }]}>Reminders are off on this phone</Text>
          <Text style={[Type.body, { color: C.warningText }]}>
            {state === 'denied'
              ? 'Notifications are switched off for HealthHub in your phone’s settings, so nothing below can reach you.'
              : 'Allow notifications so reminders can reach you.'}
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <Button
              label={state === 'denied' ? 'Open Settings' : 'Turn on reminders'}
              icon="Bell"
              size="M"
              onPress={() => (state === 'denied' ? Linking.openSettings() : ask())}
            />
          </View>
        </View>
      )}

      <SettingsGroup title="Remind me about" footer="These choices are saved on this phone, and each reminder is scheduled on it, so they work without a connection.">
        {SETTINGS.map((s, i) => (
          <SwitchRow key={s.key} label={s.label} description={s.description} value={prefs[s.key]}
            onValueChange={(v) => prefs.set(s.key, v)} divider={i < SETTINGS.length - 1} />
        ))}
      </SettingsGroup>

      {prefs.dropped > 0 ? (
        <InfoNote tone="amber" icon="Warning">
          Your phone can hold about 60 scheduled reminders, and you have {prefs.dropped} more than that. The ones furthest away
          will be added as the nearer ones pass. Turning off kinds you don&apos;t need frees up room.
        </InfoNote>
      ) : null}

      <InfoNote tone="navy" icon="Document">
        Lab report alerts need HealthHub&apos;s online service and will arrive in a later update.
      </InfoNote>
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  banner: { gap: Space.sm, padding: Space.lg, borderRadius: 16, backgroundColor: C.warningSoft },
});
