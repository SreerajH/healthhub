import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';

import { C, Radius, Space, Type } from '@/constants/healthhub';
import { useAppLock, useLocked } from '@/lib/app-lock';
import { usePreventScreenCapture } from '@/lib/screen-capture';

import { Button } from './button';
import { Icon } from './icon';

/** The cover shown while locked; tries to unlock straight away, once. */
function LockCover({ title, message, auto = true }: { title: string; message: string; auto?: boolean }) {
  const unlock = useAppLock((s) => s.unlock);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const tried = useRef(false);

  const run = async () => {
    setBusy(true);
    const ok = await unlock();
    setBusy(false);
    setFailed(!ok);
  };
  useEffect(() => {
    if (auto && !tried.current) { tried.current = true; run(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={styles.cover} accessibilityViewIsModal>
      <View style={styles.mark}><Icon name="Lock" size={32} color={C.textInverse} /></View>
      <Text style={[Type.title, { color: C.text, textAlign: 'center' }]} accessibilityRole="header">{title}</Text>
      <Text style={[Type.body, { color: C.textSecondary, textAlign: 'center' }]}>
        {failed ? 'That didn’t work. Try again, or use your phone’s PIN.' : message}
      </Text>
      <Button label="Unlock" icon="Lock" loading={busy} onPress={run} />
    </View>
  );
}

/** Full-screen lock for the whole app ("Require unlock: Opening the app"). Mount once, above the navigator. */
export function AppLockGate({ enabled }: { enabled: boolean }) {
  const locked = useLocked('app');
  if (!enabled || !locked) return null;
  return (
    <View style={StyleSheet.absoluteFill}>
      <LockCover title="HealthHub is locked" message="Unlock with your fingerprint, face or phone PIN to see your family’s health information." />
    </View>
  );
}

/** Wraps the Records tab and record details: covered when either lock mode is on and the app isn't unlocked. */
export function RecordsGate({ children }: { children: ReactNode }) {
  // Android: FLAG_SECURE keeps records out of the recent-apps preview (and blocks screenshots of them);
  // iOS: blocks screen recording of them
  usePreventScreenCapture('records');
  const locked = useLocked('records');
  if (!locked) return <>{children}</>;
  return <LockCover title="Records are locked" message="Unlock to open your family’s health records." />;
}

/**
 * iOS takes its app-switcher snapshot as the app goes inactive, so cover everything then.
 * (Android's preview is handled by RecordsGate's FLAG_SECURE; AppState fires too late there.)
 */
export function PrivacyShield() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const sub = AppState.addEventListener('change', (s) => setHidden(s !== 'active'));
    return () => sub.remove();
  }, []);
  if (!hidden) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.shield]} pointerEvents="none">
      <View style={styles.mark}><Icon name="Heart Pulse" size={32} color={C.textInverse} /></View>
      <Text style={[Type.heading, { color: C.text }]}>HealthHub</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center', padding: Space.screen, gap: Space.lg },
  shield: { backgroundColor: C.background, alignItems: 'center', justifyContent: 'center', gap: Space.md },
  mark: { width: 64, height: 64, borderRadius: Radius.card, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
});
