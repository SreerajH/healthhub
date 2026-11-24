import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, InfoNote, ListRow, SettingsGroup, SettingsScreen, useToast } from '@/components/healthhub';
import { C, Space, Type } from '@/constants/healthhub';

const FAQS: [string, string][] = [
  ['How do I cancel or move an appointment?', 'Open Bookings, tap the appointment, then Reschedule or Cancel. Doctor visits can be changed up to 2 hours before, and lab collections up to 12 hours before. Refunds reach your UPI or card in 3–5 working days.'],
  ['Who can see my family\'s records?', 'Only you. Records are encrypted and tied to your account. Sharing a record sends a copy to the people you pick, and nothing else leaves the app.'],
  ['When will my lab report arrive?', 'Each test shows its report time, usually 12–48 hours after the sample is taken. You\'ll get a notification, and the report lands in Records.'],
  ['Can I add my parents who live elsewhere?', 'Yes. Add them under Family members and keep their records and reminders alongside everyone else\'s. Bookings can use any address.'],
  ['Do you support ABHA?', 'ABHA linking is coming soon. Once linked, records from hospitals and labs across India will flow into HealthHub automatically.'],
];

/** Figma "HealthHub / Help and FAQs". */
export default function HelpScreen() {
  const toast = useToast();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <SettingsScreen title="Help and support">
      <SettingsGroup title="Get in touch">
        <ListRow icon="Phone" label="Call us" value="9 AM – 9 PM" onPress={() => toast({ message: '1800 123 4567 · 9 AM to 9 PM, every day' })} />
        <ListRow icon="Document" label="Email support" value="2 working days" onPress={() => toast({ message: 'help@healthhub.in' })} />
        <ListRow icon="Help" label="Chat with us" divider={false} onPress={() => toast({ message: 'Chat opens in a later build step' })} />
      </SettingsGroup>

      <View style={{ gap: Space.md }}>
        <Text style={[Type.heading, { color: C.text }]} accessibilityRole="header">Common questions</Text>
        <View style={styles.faqs}>
          {FAQS.map(([q, a], i) => {
            const isOpen = open === i;
            return (
              <View key={q} style={i > 0 ? styles.divider : undefined}>
                <Pressable onPress={() => setOpen(isOpen ? null : i)} accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }} accessibilityLabel={q} style={styles.q}>
                  <Text style={[Type.bodyMedium, { color: C.text, flex: 1 }]}>{q}</Text>
                  <Icon name={isOpen ? 'Chevron Down' : 'Chevron Right'} size={20} color={C.textSecondary} />
                </Pressable>
                {isOpen ? <Text style={[Type.body, styles.a]}>{a}</Text> : null}
              </View>
            );
          })}
        </View>
      </View>

      <InfoNote tone="amber" icon="Warning">
        HealthHub isn&apos;t for emergencies. If someone needs urgent help, call 108 or go to the nearest hospital.
      </InfoNote>
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  faqs: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingHorizontal: Space.lg },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  q: { flexDirection: 'row', alignItems: 'center', gap: Space.md, minHeight: 60, paddingVertical: Space.sm },
  a: { color: C.textSecondary, paddingBottom: Space.lg },
});
