import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Avatar, Button, EmptyState, Icon, MapPreview, Skeleton, Stars, StatTiles, StatusPill, StickyFooter, TopBar, useToast, type IconName,
} from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { inr } from '@/data/types';
import { useDoctor, useSlots } from '@/hooks';
import { nextFree, reviewsFor, reviewsTitle, slotLabel, useDraft } from '@/lib/booking';
import { useSelectedMember } from '@/lib/selected-member';

/** Figma "HealthHub / Doctor profile". */
export default function DoctorProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: d, isLoading } = useDoctor(id);
  const { data: slots = [] } = useSlots(id);
  const memberId = useSelectedMember((s) => s.memberId);
  const startDraft = useDraft((s) => s.start);
  const toast = useToast();

  if (!d) {
    if (isLoading) {
      return (
        <View style={styles.flex}>
          <TopBar title="Doctor profile" />
          <View style={{ padding: Space.screen, gap: Space.lg }}>
            <Skeleton width="60%" height={28} />
            <Skeleton width="100%" height={88} radius={12} />
            <Skeleton width="100%" height={180} radius={16} />
          </View>
        </View>
      );
    }
    return (
      <View style={styles.flex}>
        <TopBar title="Doctor" />
        <View style={{ paddingTop: 64 }}>
          <EmptyState icon="Stethoscope" badge={false} title="Doctor not found" message="They may no longer take bookings on HealthHub."
            actionLabel="Find a doctor" onAction={() => router.replace('/specialties')} />
        </View>
      </View>
    );
  }

  const next = nextFree(slots);
  const reviews = reviewsFor(d.specialtyId);
  // "3,200+" (grouped by hand: Intl isn't reliable on Hermes)
  const patients = `${String(Math.floor(d.patients / 100) * 100).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}+`;

  const directions = () => {
    const q = encodeURIComponent(`${d.clinic}, ${d.address}`);
    const url = Platform.select({ ios: `maps:0,0?q=${q}`, android: `geo:0,0?q=${q}`, default: `https://www.google.com/maps/search/?api=1&query=${q}` });
    Linking.openURL(url).catch(() => toast({ message: 'Couldn\'t open maps on this device', type: 'error' }));
  };
  const book = () => {
    startDraft({ kind: 'doctor', doctorId: d.id, memberId });
    router.push({ pathname: '/book/doctor/[doctorId]', params: { doctorId: d.id } });
  };

  return (
    <View style={styles.flex}>
      <TopBar title="Doctor profile" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <Avatar initials={d.initials} tone={d.tone} size="L" />
          <View style={{ flex: 1, gap: 4, alignItems: 'flex-start' }}>
            <Text style={[Type.title, { color: C.text }]} accessibilityRole="header">{d.name}</Text>
            <Text style={[Type.body, { color: C.textSecondary }]}>{d.specialty}</Text>
            {d.verified ? <StatusPill status="verified" /> : null}
          </View>
        </View>

        <StatTiles items={[['Experience', `${d.experienceYears} years`], ['Rating', `${d.rating} (${d.reviewCount})`], ['Patients', patients]]} />

        <View style={styles.card}>
          <Text style={[Type.subheading, { color: C.text }]}>About</Text>
          <Text style={[Type.body, { color: C.textSecondary }]}>{d.about}</Text>
          <Fact icon="Graduation">{d.qualifications}, {d.college}</Fact>
          <Fact icon="Language">{d.languages.join(', ')}</Fact>
          <Fact icon="Shield Tick">{d.regNo}</Fact>
        </View>

        <View style={styles.card}>
          <Text style={[Type.subheading, { color: C.text }]}>{d.clinic}</Text>
          <MapPreview />
          <Text style={[Type.body, { color: C.textSecondary }]}>{d.address} · {d.distanceKm} km away</Text>
          <View style={{ flexDirection: 'row' }}>
            <Button label="Get directions" icon="Directions" variant="ghost" size="M" onPress={directions} />
          </View>
        </View>

        <View style={{ gap: Space.md }}>
          <View style={styles.reviewHead}>
            <Text style={[Type.heading, { color: C.text, flex: 1 }]} accessibilityRole="header">{reviewsTitle(d.specialtyId)}</Text>
            <Text style={[Type.caption, { color: C.textSecondary }]}>{d.rating} from {d.reviewCount} reviews</Text>
          </View>
          {reviews.map((r, i) => (
            <View key={i} style={[styles.card, { gap: Space.sm }]}>
              <View style={styles.reviewHead}>
                <Text style={[Type.bodyMedium, { color: C.text, flex: 1 }]}>{r.name}</Text>
                <Stars value={r.stars} />
              </View>
              <Text style={[Type.body, { color: C.text }]}>{r.text}</Text>
              <Text style={[Type.micro, { color: C.textSecondary }]}>{r.ago}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <StickyFooter summary={next ? `Next: ${slotLabel(next)}` : 'No slots in the next 2 weeks'} amount={inr(d.feeInr)}>
        <Button label="Book appointment" fill style={{ flex: 1 }} onPress={book} disabled={!next} />
      </StickyFooter>
    </View>
  );
}

function Fact({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={20} color={C.textSecondary} />
      <Text style={[Type.body, { color: C.text, flex: 1 }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.sm, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: Space.lg },
  card: { backgroundColor: C.card, borderRadius: Radius.card, borderWidth: 1, borderColor: C.border, padding: Space.lg, gap: Space.md },
  fact: { flexDirection: 'row', gap: Space.md, alignItems: 'flex-start' },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
});
