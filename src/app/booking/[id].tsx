import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ActionSheet, Avatar, Button, Chip, DetailsCard, EmptyState, InfoNote, MapPreview,
  StatusPill, StickyFooter, Tag, TopBar, useToast,
} from '@/components/healthhub';
import { C, Radius, Shadow, Space, Type } from '@/constants/healthhub';
import { inr, type PaymentMethod } from '@/data/types';
import { useBookings, useCancelBooking, useDoctors, useLabPackages , useMembers } from '@/hooks';
import { canChange, PAYMENT_LABEL, whenLabel, type CancelReason } from '@/lib/booking';
import { pastLabel, pillLabel, type AnyBooking } from '@/lib/booking-rows';
import { dayLabel } from '@/lib/dates';
import { addToCalendar, callNumber, openMaps } from '@/lib/calendar';
import { ageLabel, firstName, namesList } from '@/lib/family';


const CLINIC_PHONE = '+91 80 4123 7788';
const REASONS: CancelReason[] = ['Can\'t make it', 'Booked by mistake', 'Feeling better', 'Found another doctor', 'Other'];

/** Figma "HealthHub / Appointment details" (and the lab equivalent), with reschedule and cancel. */
export default function BookingDetailsScreen() {
  const { id, cancel: cancelParam } = useLocalSearchParams<{ id: string; cancel?: string }>();
  const { appointments, labBookings } = useBookings();
  const appt = appointments.find((a) => a.id === id);
  const lab = labBookings.find((l) => l.id === id);
  const { data: doctors = [] } = useDoctors();
  const { data: packages = [] } = useLabPackages();
  const cancelBooking = useCancelBooking();
  const { data: members = [] } = useMembers();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(cancelParam === '1');
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [busy, setBusy] = useState(false);

  // arriving from the list's Cancel button opens the sheet once
  useEffect(() => { if (cancelParam === '1') router.setParams({ cancel: undefined }); }, [cancelParam]);

  if (!appt && !lab) {
    return (
      <View style={styles.flex}>
        <TopBar title="Booking" />
        <View style={{ paddingTop: 64 }}>
          <EmptyState icon="Calendar" badge={false} title="Booking not found" message="It may have been cancelled."
            actionLabel="See bookings" onAction={() => router.replace('/bookings')} />
        </View>
      </View>
    );
  }

  const b: AnyBooking = appt ? { kind: 'doctor', booking: appt } : { kind: 'lab', booking: lab! };
  const at = b.booking.startsAt;
  const upcoming = b.booking.status === 'upcoming';
  const changeable = upcoming && canChange(at, b.kind);
  const d = appt ? doctors.find((x) => x.id === appt.doctorId) : undefined;
  const p = lab ? packages.find((x) => x.id === lab.packageId) : undefined;
  const who = appt ? members.filter((m) => m.id === appt.memberId) : members.filter((m) => lab!.memberIds.includes(m.id));
  const amount = appt ? appt.feeInr : lab!.totalInr;
  const payment: PaymentMethod = (appt ?? lab)!.payment ?? 'upi';
  const place = appt ? `${d?.clinic ?? ''}, ${d?.address ?? ''}` : lab!.address;

  const calendar = async () => {
    const res = await addToCalendar({
      title: appt ? `${d?.name} — ${who[0] ? firstName(who[0]) : ''}` : `${p?.name} — home collection`,
      at,
      minutes: appt ? 30 : 20,
      location: place,
      notes: appt ? `HealthHub booking ${appt.code}` : `HealthHub booking ${lab!.code}${p?.fastingHours ? `. Fast ${p.fastingHours} hours before.` : ''}`,
    });
    if (res === 'added') toast({ message: 'Added to your calendar' });
    else if (res === 'denied') toast({ message: 'Allow calendar access in Settings to add this', type: 'error' });
    else if (res === 'failed') toast({ message: 'Couldn\'t add it to your calendar', type: 'error' });
  };

  const doCancel = async () => {
    setBusy(true);
    try {
      const res = await cancelBooking.mutateAsync({ id: b.booking.id, kind: b.kind, reason: reason ?? undefined });
      setSheet(false);
      // the refund amount is the server's, not a local guess
      toast({ message: res.refund_inr > 0 ? `Cancelled · ${inr(res.refund_inr)} will be refunded` : 'Booking cancelled' });
      if (router.canGoBack()) router.back();
      else router.replace('/bookings');
    } catch (e) {
      // e.g. "too close to the time to change online" — keep the sheet open and say why
      setSheet(false);
      toast({ message: e instanceof Error ? e.message : 'Couldn’t cancel that. Try again.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const refundLine = payment === 'later'
    ? 'You haven\'t paid for this yet, so there\'s nothing to refund.'
    : `You'll get a full refund of ${inr(amount)} to your ${PAYMENT_LABEL[payment]} account in 3–5 working days.`;

  return (
    <View style={styles.flex}>
      <TopBar
        title={appt ? 'Appointment' : 'Lab test'}
        action={upcoming ? { icon: 'More', label: 'More options', onPress: () => setMenu(true) } : undefined}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.pillRow}>
            {/* the pill carries the status; how soon it is reads better beside it */}
            <StatusPill status={b.booking.status} label={upcoming ? undefined : pastLabel(b)} />
            {upcoming ? <Text style={[Type.caption, { color: C.textSecondary }]}>{pillLabel(at) ?? dayLabel(at)}</Text> : null}
          </View>
          <Text style={[Type.title, { color: C.text }]} accessibilityRole="header">{whenLabel(at)}</Text>
          {upcoming ? <Button label="Add to calendar" icon="Calendar" variant="secondary" fill onPress={calendar} /> : null}
        </View>

        {appt ? (
          <View style={styles.card}>
            <View style={styles.row}>
              <Avatar initials={d?.initials ?? '?'} tone={d?.tone ?? 'navy'} size="M" />
              <View style={{ flex: 1 }}>
                <Text style={[Type.subheading, { color: C.text }]}>{d?.name}</Text>
                <Text style={[Type.caption, { color: C.textSecondary }]}>{d?.specialty} · {d?.experienceYears} yrs exp</Text>
              </View>
            </View>
            {who[0] ? (
              <View style={styles.row}>
                <Avatar name={who[0].name} photo={who[0].photo} tone={who[0].tone} size="S" />
                <Text style={[Type.bodyMedium, { color: C.text, flex: 1 }]}>For {who[0].name}, {ageLabel(who[0].dob)}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={[Type.subheading, { color: C.text }]}>{p?.name}</Text>
            <Text style={[Type.caption, { color: C.textSecondary }]}>
              {p?.testsCount} test{p?.testsCount === 1 ? '' : 's'} · report in {p?.reportHours} h · by {p?.lab}
            </Text>
            <View style={styles.tags}>
              <Tag label="Home collection" icon="Home" tone="teal" />
              {p?.fastingHours ? <Tag label={`Fast ${p.fastingHours} h before`} icon="Clock" tone="amber" /> : null}
            </View>
            <View style={styles.row}>
              <View style={{ flexDirection: 'row' }}>
                {who.map((m, i) => (
                  <View key={m.id} style={i ? styles.stacked : undefined}>
                    <Avatar name={m.name} photo={m.photo} tone={m.tone} size="S" />
                  </View>
                ))}
              </View>
              <Text style={[Type.bodyMedium, { color: C.text, flex: 1 }]}>For {namesList(who.map((m) => m.name))}</Text>
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={[Type.subheading, { color: C.text }]}>{appt ? d?.clinic : lab!.addressLabel ?? 'Home'}</Text>
          <Text style={[Type.body, { color: C.textSecondary }]}>{appt ? d?.address : lab!.address}</Text>
          <MapPreview />
          <View style={styles.row}>
            <Button label="Directions" icon="Directions" variant="secondary" size="M" fill style={{ flex: 1 }}
              onPress={() => openMaps(place).catch(() => toast({ message: 'Couldn\'t open maps on this device', type: 'error' }))} />
            {appt ? (
              <Button label="Call clinic" icon="Phone" variant="secondary" size="M" fill style={{ flex: 1 }}
                onPress={() => callNumber(CLINIC_PHONE).catch(() => toast({ message: 'Couldn\'t start the call', type: 'error' }))} />
            ) : null}
          </View>
        </View>

        {upcoming ? (
          <InfoNote tone="navy">
            {appt
              ? `Bring ${who[0] ? `${firstName(who[0])}'s` : 'the patient\'s'} vaccination card and any recent reports. Please arrive 10 minutes early.`
              : `Keep an ID ready. ${p?.fastingHours ? `Fast for ${p.fastingHours} hours before — water is fine.` : 'No fasting needed for this test.'}`}
          </InfoNote>
        ) : null}

        <DetailsCard rows={[
          ['Booking ID', b.booking.code],
          [payment === 'later' ? 'To pay' : 'Paid', payment === 'later' ? `${inr(amount)} ${appt ? 'at the clinic' : 'at collection'}` : `${inr(amount)} by ${PAYMENT_LABEL[payment]}`],
        ]} />

        {upcoming && !changeable ? (
          <InfoNote tone="amber">
            This is too close to the time to change online. Call the {appt ? 'clinic' : 'lab'} if you need to move it.
          </InfoNote>
        ) : null}
      </ScrollView>

      {changeable ? (
        <StickyFooter>
          {appt ? (
            <Button label="Reschedule" variant="secondary" fill style={{ flex: 1 }}
              onPress={() => router.push({ pathname: '/booking/reschedule', params: { id: appt.id } })} />
          ) : null}
          <Button label="Cancel booking" variant="dangerGhost" fill style={{ flex: 1 }} onPress={() => setSheet(true)} />
        </StickyFooter>
      ) : null}

      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        actions={[
          { label: 'Add to calendar', icon: 'Calendar', onPress: calendar },
          ...(appt && changeable ? [{ label: 'Reschedule', icon: 'Clock' as const, onPress: () => router.push({ pathname: '/booking/reschedule' as const, params: { id: appt.id } }) }] : []),
          ...(changeable ? [{ label: appt ? 'Cancel appointment' : 'Cancel booking', icon: 'Close' as const, danger: true, onPress: () => setSheet(true) }] : []),
        ]}
      />

      {/* Figma "Cancel appointment": consequence first, optional reason chips, then the two buttons */}
      <CancelSheet
        visible={sheet}
        title={appt ? 'Cancel this appointment?' : 'Cancel this lab test?'}
        message={`${appt ? `${d?.name}, ${whenLabel(at)}` : `${p?.name}, ${whenLabel(at)}`}. ${refundLine}`}
        reason={reason}
        onReason={setReason}
        busy={busy}
        confirmLabel={appt ? 'Cancel appointment' : 'Cancel booking'}
        onConfirm={doCancel}
        onClose={() => setSheet(false)}
      />
    </View>
  );
}

function CancelSheet({
  visible, title, message, reason, onReason, onConfirm, onClose, busy, confirmLabel,
}: {
  visible: boolean; title: string; message: string; reason: CancelReason | null;
  onReason: (r: CancelReason) => void; onConfirm: () => void; onClose: () => void; busy: boolean; confirmLabel: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Keep the booking" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Space.lg }]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <Text style={[Type.title, { color: C.text }]} accessibilityRole="header">{title}</Text>
          <Text style={[Type.body, { color: C.textSecondary }]}>{message}</Text>
          <View style={{ gap: Space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Reason (optional)">
            <Text style={[Type.bodyMedium, { color: C.text }]}>Reason (optional)</Text>
            <View style={styles.chips}>
              {REASONS.map((r) => <Chip key={r} label={r} active={reason === r} onPress={() => onReason(r)} />)}
            </View>
          </View>
          <View style={styles.row}>
            <Button label="Keep it" variant="secondary" fill style={{ flex: 1 }} onPress={onClose} disabled={busy} />
            <Button label={confirmLabel} variant="danger" fill style={{ flex: 1 }} loading={busy} onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.sm, paddingBottom: Space.xxxl, gap: Space.lg, width: '100%', maxWidth: 600, alignSelf: 'center' },
  card: { backgroundColor: C.card, borderRadius: Radius.card, borderWidth: 1, borderColor: C.border, padding: Space.lg, gap: Space.md },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  tags: { flexDirection: 'row', gap: Space.sm, flexWrap: 'wrap' },
  stacked: { marginLeft: -10 },
  scrim: { flex: 1, backgroundColor: C.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet,
    padding: Space.xxl, paddingTop: Space.sm, gap: Space.lg, boxShadow: Shadow.float, width: '100%', maxWidth: 600, alignSelf: 'center',
  },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.borderStrong, alignSelf: 'center', marginBottom: Space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Space.sm },
});
