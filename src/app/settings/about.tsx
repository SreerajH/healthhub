import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { ListRow, SettingsGroup, SettingsScreen, useToast } from '@/components/healthhub';
import { C, Space, Type } from '@/constants/healthhub';

/** Profile → About HealthHub. */
export default function AboutScreen() {
  const toast = useToast();
  return (
    <SettingsScreen title="About HealthHub">
      <View style={styles.hero}>
        <Image source={require('@/assets/images/splash-icon.png')} style={styles.mark} contentFit="contain" />
        <Text style={[Type.title, { color: C.text }]}>HealthHub</Text>
        <Text style={[Type.body, styles.center]}>
          One place to manage your whole family&apos;s health: records, appointments, vaccines, medicines and lab tests.
        </Text>
        <Text style={[Type.caption, { color: C.textSecondary }]}>Version 1.0 · Made in Bengaluru</Text>
      </View>

      <SettingsGroup>
        <ListRow icon="Document" label="Terms of use" onPress={() => toast({ message: 'Terms open on healthhub.in' })} />
        <ListRow icon="Lock" label="Privacy policy" onPress={() => toast({ message: 'The policy opens on healthhub.in' })} />
        <ListRow icon="Heart" label="Rate HealthHub" divider={false} onPress={() => toast({ message: 'Thank you! The store page opens on a phone' })} />
      </SettingsGroup>

      <Text style={[Type.caption, styles.center]}>
        HealthHub doesn&apos;t give medical advice. Always follow your doctor&apos;s instructions.
      </Text>
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.xl },
  mark: { width: 72, height: 72, marginBottom: Space.sm },
  center: { color: C.textSecondary, textAlign: 'center', maxWidth: 320 },
});
