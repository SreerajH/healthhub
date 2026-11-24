import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, DetailsCard, EmptyState, IconButton, InfoNote, StickyFooter, SuccessMark, useToast } from '@/components/healthhub';
import { C, Space, Type } from '@/constants/healthhub';
import { inr, type PaymentMethod } from '@/data/types';
import { useBookings, useDoctors, useLabPackages , useMembers } from '@/hooks';
import { PAYMENT_LABEL, whenLabel } from '@/lib/booking';
import { firstName, namesList } from '@/lib/family';


const home = () => router.dismissTo('/');
// leave the booking stack first, then switch tabs: dismissTo('/bookings') lands on the tabs' anchor (Home)
const viewBooking = () => { router.dismissTo('/'); router.navigate('/bookings'); };

/** Figma "HealthHub / Booking confirmed" and "Lab booking confirmed": animated tick, booking ID with copy. */
export default function ConfirmedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { appointments, labBookings } = useBookings();
  const appt = appointments.find((a) => a.id === id);
  const lab = labBookings.find((l) => l.id === id);
  const { data: doctors = [] } = useDoctors();
  const { data: packages = [] } = useLabPackages();
  const { data: members = [] } = useMembers();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState(false);

  // hardware back goes home, not back into the paid booking flow
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { home(); return true; });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const t = setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, []);

  if (!appt && !lab) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top + 64 }]}>
        <EmptyState icon="Calendar" badge={false} title="Booking not found" message="See all your bookings in the Bookings tab."
          actionLabel="Go to Bookings" onAction={viewBooking} />
      </View>
    );
  }

  const code = (appt ?? lab)!.code;
  const copy = async () => {
    await Clipboard.setStringAsync(code);
    toast({ message: `Booking ID ${code} copied` });
  };
  const paid = (amount: number, method: PaymentMethod = appt?.payment ?? lab?.payment ?? 'upi') =>
    method === 'later' ? `${inr(amount)} ${appt ? 'at the clinic' : 'at collection'}` : `${inr(amount)} by ${PAYMENT_LABEL[method ?? 'upi']}`;

  let title: string, message: string, rows: [string, string][], note: { tone: 'navy' | 'amber'; text: string };
  if (appt) {
    const d = doctors.find((x) => x.id === appt.doctorId);
    const m = members.find((x) => x.id === appt.memberId);
    title = 'Booking confirmed';
    message = `${m ? (m.relation === 'self' ? 'Your' : `${firstName(m)}'s`) : 'The'} visit is booked. We've sent the details by SMS.`;
    rows = [
      ['Doctor', d?.name ?? '—'], ['Patient', m?.name ?? '—'], ['When', whenLabel(appt.startsAt)],
      ['Where', d ? `${d.clinic}${d.clinic.includes(d.area) ? '' : `, ${d.area}`}` : '—'],
      [appt.payment === 'later' ? 'To pay' : 'Paid', paid(appt.feeInr)],
    ];
    note = { tone: 'navy', text: 'We\'ll remind you 24 hours and 2 hours before.' };
  } else {
    const p = packages.find((x) => x.id === lab!.packageId);
    const names = members.filter((x) => lab!.memberIds.includes(x.id)).map(firstName);
    title = 'Lab test booked';
    message = 'A phlebotomist will come to collect the sample. We\'ve sent the details by SMS.';
    rows = [
      ['Test', p?.name ?? '—'], ['For', namesList(names)], ['When', whenLabel(lab!.startsAt)],
      ['Where', lab!.addressLabel ?? lab!.address],
      [lab!.payment === 'later' ? 'To pay' : 'Paid', paid(lab!.totalInr)],
    ];
    note = p?.fastingHours
      ? { tone: 'amber', text: `Remember to fast for ${p.fastingHours} hours before. We'll remind you the night before.` }
      : { tone: 'navy', text: 'We\'ll remind you the evening before. Reports arrive in Records.' };
  }

  const up = (i: number) => FadeInUp.delay(i * 90).duration(320);

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Space.xxxl }]}>
        <SuccessMark onDone={() => setShown(true)} />
        {shown ? (
          <>
            <Animated.View entering={up(0)} style={{ gap: Space.sm }}>
              <Text style={[Type.display, styles.center, { color: C.text }]} accessibilityRole="header" accessibilityLiveRegion="polite">{title}</Text>
              <Text style={[Type.body, styles.center, { color: C.textSecondary }]}>{message}</Text>
            </Animated.View>
            <Animated.View entering={up(1)}>
              <DetailsCard
                header={
                  <View style={styles.idRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[Type.micro, { color: C.textSecondary }]}>Booking ID</Text>
                      <Text style={[Type.heading, { color: C.text }]} selectable>{code}</Text>
                    </View>
                    <IconButton icon="Copy" variant="soft" accessibilityLabel={`Copy booking ID ${code}`} onPress={copy} />
                  </View>
                }
                rows={rows}
              />
            </Animated.View>
            <Animated.View entering={up(2)}>
              <InfoNote tone={note.tone} icon={note.tone === 'amber' ? 'Info' : 'Bell'}>{note.text}</InfoNote>
            </Animated.View>
          </>
        ) : null}
      </ScrollView>

      {shown ? (
        <Animated.View entering={up(3)}>
          <StickyFooter>
            <Button label="Back to home" variant="secondary" fill style={{ flex: 1 }} onPress={home} />
            <Button label="View booking" fill style={{ flex: 1 }} onPress={viewBooking} />
          </StickyFooter>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: Space.screen, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  center: { textAlign: 'center' },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md, flex: 1 },
});
