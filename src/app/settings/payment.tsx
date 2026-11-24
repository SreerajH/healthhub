import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, InfoNote, SelectCard, SettingsGroup, SettingsScreen, useToast } from '@/components/healthhub';
import { C, Space, Type } from '@/constants/healthhub';

/** Profile → Payment methods. Real cards and UPI handles arrive with the payment provider in Part C. */
export default function PaymentScreen() {
  const toast = useToast();
  const [preferred, setPreferred] = useState<'upi' | 'card'>('upi');

  return (
    <SettingsScreen title="Payment methods">
      <View style={{ gap: Space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Preferred payment method">
        <Text style={[Type.bodyMedium, { color: C.textSecondary }]}>Pay with, by default</Text>
        <SelectCard control="radio" selected={preferred === 'upi'} onPress={() => setPreferred('upi')}
          icon="Wallet" title="UPI" subtitle="Choose your app at payment time" />
        <SelectCard control="radio" selected={preferred === 'card'} onPress={() => setPreferred('card')}
          icon="Card" title="Debit or credit card" subtitle="Visa, Mastercard, RuPay" />
      </View>

      <SettingsGroup title="Saved cards" footer="HealthHub never stores your card number. Cards are saved with our payment provider.">
        <View style={{ padding: Space.lg, gap: Space.md }}>
          <Text style={[Type.body, { color: C.textSecondary }]}>No cards saved yet.</Text>
          <Button label="Add a card" icon="Plus" variant="secondary" size="M" onPress={() => toast({ message: 'Adding cards arrives with payments in the next phase' })} />
        </View>
      </SettingsGroup>

      <InfoNote tone="teal" icon="Shield Tick">
        You can also pay at the clinic or when the sample is collected — pick that at checkout.
      </InfoNote>

      <Button label="See your bookings" variant="secondary" onPress={() => router.push('/bookings')} />
    </SettingsScreen>
  );
}
