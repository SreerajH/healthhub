import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Button, Icon, StickyFooter, type IconName } from '@/components/healthhub';
import { C, Radius, Shadow, Space, Type } from '@/constants/healthhub';

export const ONBOARDED_KEY = 'healthhub.onboarded.v1';

const SLIDES: { art: IconName; chips: { label: string; icon: IconName; tone: 'navy' | 'teal' }[]; title: string; body: string }[] = [
  {
    art: 'Folder',
    chips: [{ label: 'Prescription', icon: 'Prescription', tone: 'navy' }, { label: 'Lab report', icon: 'Flask', tone: 'teal' }],
    title: 'All your family\'s records in one place',
    body: 'Prescriptions, lab reports, scans and vaccine certificates for everyone, sorted by person and date.',
  },
  {
    art: 'Alarm',
    chips: [{ label: 'Metformin, 9 PM', icon: 'Pill', tone: 'navy' }, { label: 'MMR due Fri', icon: 'Syringe', tone: 'teal' }],
    title: 'Never miss a dose or a vaccine',
    body: 'Set reminders for medicines and vaccines, mark each dose as taken, and keep a streak going.',
  },
  {
    art: 'Stethoscope',
    chips: [{ label: 'Today, 4:30 PM', icon: 'Calendar Tick', tone: 'navy' }, { label: 'Home collection', icon: 'Home', tone: 'teal' }],
    title: 'Book doctors and lab tests',
    body: 'Find a doctor by specialty, pick a time that suits you, or have a lab come to your home.',
  },
];

/** Figma "HealthHub / Onboarding" 1–3: what the app is for, before asking anyone to sign in. */
export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const page = Math.min(width, 600);

  const done = async () => {
    await AsyncStorage.setItem(ONBOARDED_KEY, 'yes').catch(() => {});
    router.replace('/(auth)/sign-in');
  };
  const next = () => {
    if (index === SLIDES.length - 1) return done();
    scroller.current?.scrollTo({ x: (index + 1) * page, animated: true });
    setIndex(index + 1);
  };

  return (
    <View style={styles.flex}>
      <View style={styles.skipRow}>
        <Pressable onPress={done} accessibilityRole="button" style={styles.skip}>
          <Text style={[Type.bodyMedium, { color: C.primary }]}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / page))}
        style={{ flexGrow: 0 }}>
        {SLIDES.map((s) => (
          <View key={s.title} style={[styles.slide, { width: page }]}>
            <View style={styles.art}>
              <View style={styles.halo} />
              <Icon name={s.art} size={88} color={C.primary} />
              <View style={[styles.chip, styles.chipTopLeft]}>
                <View style={[styles.chipIcon, { backgroundColor: C.primarySoft }]}>
                  <Icon name={s.chips[0].icon} size={16} color={C.primary} />
                </View>
                <Text style={[Type.bodyMedium, { color: C.text }]} numberOfLines={1}>{s.chips[0].label}</Text>
              </View>
              <View style={[styles.chip, styles.chipBottomRight]}>
                <View style={[styles.chipIcon, { backgroundColor: C.tealSoft }]}>
                  <Icon name={s.chips[1].icon} size={16} color={C.tealText} />
                </View>
                <Text style={[Type.bodyMedium, { color: C.text }]} numberOfLines={1}>{s.chips[1].label}</Text>
              </View>
            </View>

            <View style={styles.copy}>
              <Text style={[Type.display, styles.center, { color: C.text }]} accessibilityRole="header">{s.title}</Text>
              <Text style={[Type.body, styles.center, { color: C.textSecondary }]}>{s.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots} accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`}>
        {SLIDES.map((s, i) => <View key={s.title} style={[styles.dot, i === index && styles.dotOn]} />)}
      </View>

      <StickyFooter>
        <Button label={index === SLIDES.length - 1 ? 'Get started' : 'Next'} fill style={{ flex: 1 }} onPress={next} />
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background, justifyContent: 'space-between' },
  skipRow: { alignItems: 'flex-end', paddingHorizontal: Space.screen, paddingTop: Space.xxl },
  skip: { minHeight: 44, paddingHorizontal: Space.sm, justifyContent: 'center' },
  slide: { alignItems: 'center', gap: Space.xxxl, paddingHorizontal: Space.screen },
  art: { width: 260, height: 260, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: C.primarySoft },
  chip: {
    position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: Space.sm, maxWidth: 190,
    paddingVertical: Space.sm, paddingHorizontal: Space.md, borderRadius: Radius.pill, backgroundColor: C.card, boxShadow: Shadow.card,
  },
  chipTopLeft: { top: 30, left: -8 },
  chipBottomRight: { bottom: 34, right: -8 },
  chipIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  copy: { gap: Space.md, maxWidth: 420 },
  center: { textAlign: 'center' },
  dots: { flexDirection: 'row', gap: Space.sm, justifyContent: 'center', paddingVertical: Space.xl },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  dotOn: { width: 22, backgroundColor: C.primary },
});
