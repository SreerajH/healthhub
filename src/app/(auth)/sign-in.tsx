import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Icon, InfoNote, StickyFooter, useToast } from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { isValidEmail, isValidIndianMobile, toE164, useAuth, type Identifier } from '@/lib/auth';

/** Phone sign-in needs an SMS provider on the Supabase project; until then email codes are the way in. */
const PHONE_AUTH = process.env.EXPO_PUBLIC_PHONE_AUTH === 'on';

/** Figma "HealthHub / Sign in": a one-time code, by phone or email. */
export default function SignInScreen() {
  const { sendCode, devSignIn } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<'phone' | 'email'>(PHONE_AUTH ? 'phone' : 'email');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [devBusy, setDevBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const e164 = toE164(phone);
  const id: Identifier = mode === 'phone' ? { kind: 'phone', value: e164 } : { kind: 'email', value: email.trim() };
  const valid = mode === 'phone' ? isValidIndianMobile(e164) : isValidEmail(email);

  const dev = async () => {
    setDevBusy(true);
    const res = await devSignIn();
    setDevBusy(false);
    if (res.error) setError(res.error);
    // on success the root layout moves on to Home
  };

  const send = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const res = await sendCode(id);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      // SMS isn't configured on this project yet — email still works
      if (mode === 'phone' && res.error.includes('Phone sign-in isn\'t switched on')) setMode('email');
      return;
    }
    toast({ message: `Code sent to ${mode === 'phone' ? 'your phone' : email.trim()}` });
    router.push({ pathname: '/(auth)/verify', params: { kind: id.kind, value: id.value } });
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.mark}>
          <Icon name="Heart Pulse" size={32} color={C.textInverse} />
        </View>

        <View style={{ gap: Space.sm }}>
          <Text style={[Type.title, { color: C.text }]} accessibilityRole="header">
            {mode === 'phone' ? 'Sign in with your phone' : 'Sign in with your email'}
          </Text>
          <Text style={[Type.body, { color: C.textSecondary }]}>
            We&apos;ll {mode === 'phone' ? 'text' : 'email'} you a 6-digit code. No password needed.
          </Text>
        </View>

        {mode === 'phone' ? (
          <View style={{ gap: Space.sm }}>
            <Text style={[Type.bodyMedium, { color: C.text }]}>Mobile number</Text>
            <View style={[styles.field, !!error && styles.fieldError]}>
              <Text style={[Type.body, { color: C.text }]}>+91</Text>
              <TextInput
                value={phone}
                onChangeText={(v) => { setPhone(v.replace(/[^\d ]/g, '').slice(0, 11)); setError(null); }}
                placeholder="98450 12345"
                placeholderTextColor={C.textSecondary}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                autoFocus
                accessibilityLabel="Mobile number"
                style={[Type.body, styles.input]}
              />
            </View>
            <Text style={[Type.caption, { color: error ? C.dangerText : C.textSecondary }]}>
              {error ?? 'Used only to sign in and send booking updates.'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: Space.sm }}>
            <Text style={[Type.bodyMedium, { color: C.text }]}>Email address</Text>
            <View style={[styles.field, !!error && styles.fieldError]}>
              <TextInput
                value={email}
                onChangeText={(v) => { setEmail(v); setError(null); }}
                placeholder="you@example.com"
                placeholderTextColor={C.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                autoFocus
                accessibilityLabel="Email address"
                style={[Type.body, styles.input]}
              />
            </View>
            <Text style={[Type.caption, { color: error ? C.dangerText : C.textSecondary }]}>
              {error ?? 'Used only to sign in and send booking updates.'}
            </Text>
          </View>
        )}

        <InfoNote tone="navy" icon="Lock">
          Your records are encrypted and only your account can see them.
        </InfoNote>

        {__DEV__ ? (
          <View style={styles.devBox}>
            <Text style={[Type.caption, { color: C.textSecondary }]}>
              Development build only. Skips the email code and signs in as the dev account, which has the sample family loaded.
            </Text>
            <Button label="Dev sign-in" icon="Settings" variant="secondary" size="M" loading={devBusy} onPress={dev} />
          </View>
        ) : null}

        {PHONE_AUTH ? (
          <Pressable
            onPress={() => { setMode(mode === 'phone' ? 'email' : 'phone'); setError(null); }}
            accessibilityRole="button"
            style={styles.switch}>
            <Text style={[Type.bodyMedium, { color: C.primary }]}>
              {mode === 'phone' ? 'Use email instead' : 'Use my phone number instead'}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <StickyFooter>
        <View style={{ flex: 1, gap: Space.md }}>
          <Text style={[Type.caption, { color: C.textSecondary, textAlign: 'center' }]}>
            By continuing you agree to the Terms of use and Privacy policy.
          </Text>
          <Button label="Send code" fill loading={busy} disabled={!valid} onPress={send} />
        </View>
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.xxxl, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  mark: { width: 64, height: 64, borderRadius: Radius.card, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: Space.sm, minHeight: 60, paddingHorizontal: Space.lg,
    borderRadius: Radius.button, borderWidth: 2, borderColor: C.primary, backgroundColor: C.card,
  },
  fieldError: { borderColor: C.danger },
  input: { flex: 1, color: C.text, height: '100%', outlineWidth: 0 },
  switch: { minHeight: 44, justifyContent: 'center' },
  devBox: { gap: Space.sm, padding: Space.lg, borderRadius: Radius.card, borderWidth: 1, borderStyle: 'dashed', borderColor: C.borderStrong },
});
