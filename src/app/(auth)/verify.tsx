import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Icon, StickyFooter, TopBar, useToast } from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { labelFor, useAuth, type Identifier } from '@/lib/auth';

const LENGTH = 6;
const RESEND_SECONDS = 30;

/** Figma "HealthHub / Verify OTP": six boxes, auto-advance, resend countdown. */
export default function VerifyScreen() {
  const params = useLocalSearchParams<{ kind: 'phone' | 'email'; value: string }>();
  const id: Identifier = { kind: params.kind === 'email' ? 'email' : 'phone', value: params.value ?? '' };
  const { verifyCode, sendCode } = useAuth();
  const toast = useToast();

  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(RESEND_SECONDS);
  const inputs = useRef<(ComponentRef<typeof TextInput> | null)[]>([]);
  const code = digits.join('');

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const submit = async (value = code) => {
    if (value.length !== LENGTH || busy) return;
    setBusy(true);
    setError(null);
    const res = await verifyCode(id, value);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      setDigits(Array(LENGTH).fill(''));
      inputs.current[0]?.focus();
      return;
    }
    // the root layout sends them on to the profile step or the app
  };

  const setAt = (i: number, raw: string) => {
    setError(null);
    const typed = raw.replace(/\D/g, '');
    if (!typed) {
      setDigits((d) => d.map((x, k) => (k === i ? '' : x)));
      return;
    }
    // handles a pasted or autofilled code as well as a single keystroke
    setDigits((d) => {
      const next = [...d];
      for (let k = 0; k < typed.length && i + k < LENGTH; k++) next[i + k] = typed[k];
      const filled = Math.min(i + typed.length, LENGTH - 1);
      inputs.current[filled]?.focus();
      const joined = next.join('');
      if (joined.length === LENGTH && !joined.includes('')) setTimeout(() => submit(joined), 80);
      return next;
    });
  };

  const onKey = (i: number, key: string) => {
    if (key !== 'Backspace') return;
    setDigits((d) => {
      if (d[i]) return d.map((x, k) => (k === i ? '' : x));
      if (i > 0) inputs.current[i - 1]?.focus();
      return d.map((x, k) => (k === i - 1 ? '' : x));
    });
  };

  const resend = async () => {
    if (left > 0) return;
    const res = await sendCode(id);
    if (res.error) { setError(res.error); return; }
    setLeft(RESEND_SECONDS);
    toast({ message: 'New code sent' });
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar title="Verify number" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={{ gap: Space.sm }}>
          <Text style={[Type.title, { color: C.text }]} accessibilityRole="header">Enter the 6-digit code</Text>
          <Text style={[Type.body, { color: C.textSecondary }]}>Sent to {labelFor(id)}</Text>
        </View>

        <View style={styles.boxes} accessibilityLabel="6-digit code">
          {digits.map((d, i) => (
            <TextInput
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              value={d}
              onChangeText={(v) => setAt(i, v)}
              onKeyPress={(e) => onKey(i, e.nativeEvent.key)}
              keyboardType="number-pad"
              maxLength={LENGTH}
              autoFocus={i === 0}
              selectTextOnFocus
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              accessibilityLabel={`Digit ${i + 1}`}
              style={[Type.title, styles.box, !!d && styles.boxFilled, !!error && styles.boxError]}
            />
          ))}
        </View>

        {error ? (
          <View style={styles.errorRow} accessibilityLiveRegion="polite">
            <Icon name="Info" size={16} color={C.dangerText} />
            <Text style={[Type.caption, { color: C.dangerText, flex: 1 }]}>{error}</Text>
          </View>
        ) : null}

        <Pressable onPress={resend} disabled={left > 0} accessibilityRole="button"
          accessibilityLabel={left > 0 ? `Resend code in ${left} seconds` : 'Resend code'} style={styles.resend}>
          <Icon name="Clock" size={18} color={left > 0 ? C.textSecondary : C.primary} />
          <Text style={[Type.body, { color: left > 0 ? C.textSecondary : C.primary }]}>
            {left > 0 ? `Resend code in 0:${String(left).padStart(2, '0')}` : 'Resend code'}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.resend}>
          <Text style={[Type.bodyMedium, { color: C.primary }]}>
            Wrong {id.kind === 'phone' ? 'number' : 'address'}? Change it
          </Text>
        </Pressable>
      </ScrollView>

      <StickyFooter>
        <Button label="Verify" fill style={{ flex: 1 }} loading={busy} disabled={code.length !== LENGTH} onPress={() => submit()} />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.lg, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  boxes: { flexDirection: 'row', gap: Space.sm },
  box: {
    flex: 1, height: 72, borderRadius: Radius.button, borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
    textAlign: 'center', color: C.text, outlineWidth: 0,
  },
  boxFilled: { borderColor: C.borderStrong },
  boxError: { borderColor: C.danger },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -Space.md },
  resend: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, minHeight: 44 },
});
