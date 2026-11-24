import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, DetailsCard, EmptyState, SelectCard, StickyFooter, Tag, TopBar, useToast, type IconName } from '@/components/healthhub';
import { C, Space, Type } from '@/constants/healthhub';
import { inr, type PaymentMethod } from '@/data/types';
import { useBookAppointment, useBookLab, useDoctor, useLabPackage, useMembers } from '@/hooks';
import { useAddresses, useDraft, whenLabel } from '@/lib/booking';
import { useEnsureConsent } from '@/lib/consent';
import { firstName, namesList } from '@/lib/family';

/** Figma "HealthHub / Review and pay" — doctor and lab bookings. Payment is mocked until Part C. */
export default function ReviewScreen() {
  const draft = useDraft();
  const { data: members = [] } = useMembers();
  const addresses = useAddresses((s) => s.addresses);
  const bookAppointment = useBookAppointment();
  const bookLab = useBookLab();
  const [paying, setPaying] = useState(false);
  const ensureConsent = useEnsureConsent();
  const toast = useToast();

  const { data: doctor } = useDoctor(draft.kind === 'doctor' ? draft.doctorId : undefined);
  const { data: pkg } = useLabPackage(draft.kind === 'lab' ? draft.packageId : undefined);
  const member = members.find((m) => m.id === draft.memberId);
  const labMembers = members.filter((m) => draft.memberIds.includes(m.id));
  const address = addresses.find((a) => a.id === draft.addressId);
  const ready = !!draft.at && (doctor ? !!member : !!pkg && labMembers.length > 0 && !!address);

  if (!ready) {
    return (
      <View style={styles.flex}>
        <TopBar title="Review and pay" />
        <View style={{ paddingTop: 64 }}>
          <EmptyState icon="Calendar" badge={false} title="Nothing to review" message="Start a booking to see its summary here."
            actionLabel="Find a doctor" onAction={() => router.replace('/specialties')} />
        </View>
      </View>
    );
  }

  const at = draft.at!;
  const total = doctor ? doctor.feeInr : pkg!.priceInr * labMembers.length;
  const methods: { key: PaymentMethod; title: string; subtitle: string; icon: IconName }[] = [
    { key: 'upi', title: 'UPI', subtitle: 'Google Pay, PhonePe, Paytm or any UPI app', icon: 'Wallet' },
    { key: 'card', title: 'Debit or credit card', subtitle: 'Visa, Mastercard, RuPay', icon: 'Card' },
    doctor
      ? { key: 'later', title: 'Pay at the clinic', subtitle: 'Cash or card on the day', icon: 'Hospital' }
      : { key: 'later', title: 'Pay at collection', subtitle: 'Cash or UPI when the sample is taken', icon: 'Home' },
  ];
  const payLater = draft.payment === 'later';

  const pay = async () => {
    if (!(await ensureConsent('bookings'))) return;
    setPaying(true);
    // mock payment: a short wait stands in for the UPI / card sheet
    await new Promise((r) => setTimeout(r, payLater ? 500 : 1400));
    try {
      const bookingId = doctor
        ? await bookAppointment.mutateAsync({ memberId: member!.id, doctorId: doctor.id, slotId: draft.slotId!, at, payment: draft.payment })
        : await bookLab.mutateAsync({
            memberIds: labMembers.map((m) => m.id), packageId: pkg!.id, addressId: address!.id,
            address: address!.line, addressLabel: `${address!.label}${address!.area ? `, ${address!.area}` : ''}`,
            at, payment: draft.payment,
          });
      router.replace({ pathname: '/book/confirmed', params: { id: bookingId } });
    } catch (e) {
      setPaying(false);
      toast({ message: e instanceof Error ? e.message : 'Couldn’t complete the booking', type: 'error' });
    }
  };

  return (
    <View style={styles.flex}>
      <TopBar title="Review and pay" />
      <ScrollView contentContainerStyle={styles.content}>
        {doctor ? (
          <DetailsCard
            header={
              <View style={styles.head}>
                <Avatar initials={doctor.initials} tone={doctor.tone} size="M" />
                <View style={{ flex: 1 }}>
                  <Text style={[Type.subheading, { color: C.text }]}>{doctor.name}</Text>
                  <Text style={[Type.caption, { color: C.textSecondary }]}>{doctor.specialty}</Text>
                </View>
              </View>
            }
            rows={[['Patient', member!.name], ['When', whenLabel(at)], ['Where', `${doctor.clinic}${doctor.clinic.includes(doctor.area) ? '' : `, ${doctor.area}`}`]]}
          />
        ) : (
          <DetailsCard
            header={
              <View style={{ gap: Space.sm, flex: 1 }}>
                <Text style={[Type.subheading, { color: C.text }]}>{pkg!.name}</Text>
                <View style={{ flexDirection: 'row', gap: Space.sm }}>
                  <Tag label="Home collection" icon="Home" tone="teal" />
                  {pkg!.fastingHours ? <Tag label={`Fast ${pkg!.fastingHours} h`} icon="Clock" tone="amber" /> : null}
                </View>
              </View>
            }
            rows={[['For', namesList(labMembers.map(firstName))], ['When', whenLabel(at)], ['Where', `${address!.label}${address!.area ? `, ${address!.area}` : ''}`]]}
          />
        )}

        <DetailsCard
          emphasizeLast
          rows={doctor
            ? [['Consultation fee', inr(doctor.feeInr)], ['Platform fee', 'Free'], ['To pay', inr(total)]]
            : [[labMembers.length > 1 ? `${inr(pkg!.priceInr)} × ${labMembers.length} people` : 'Test price', inr(total)], ['Home collection', 'Free'], ['To pay', inr(total)]]}
        />

        <View style={{ gap: Space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Pay with">
          <Text style={[Type.subheading, { color: C.text }]}>Pay with</Text>
          {methods.map((m) => (
            <SelectCard key={m.key} control="radio" selected={draft.payment === m.key} onPress={() => draft.update({ payment: m.key })}
              icon={m.icon} title={m.title} subtitle={m.subtitle} disabled={paying} />
          ))}
        </View>

        <View style={{ flexDirection: 'row' }}>
          <Tag label={doctor ? 'Free cancellation up to 2 hours before' : 'Free cancellation up to 12 hours before'} icon="Tick Circle" tone="teal" />
        </View>
      </ScrollView>

      <StickyFooter summary={whenLabel(at)} amount={inr(total)}>
        <Button label={payLater ? 'Confirm booking' : `Pay ${inr(total)}`} fill style={{ flex: 1 }} loading={paying} onPress={pay} />
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.sm, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: Space.md, flex: 1 },
});
