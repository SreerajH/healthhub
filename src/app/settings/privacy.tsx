import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Button, ChipGroup, Field, InfoNote, ListRow, SettingsGroup, SettingsScreen, Skeleton, SwitchRow, useToast,
} from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { deleteMyAccount, downloadMyData } from '@/lib/account-data';
import { authenticate, lockSupport, useAppLock, type LockMode } from '@/lib/app-lock';
import { useAuth } from '@/lib/auth';
import { PURPOSES, useConsentRows, useConsents, useSetConsents, type Purpose } from '@/lib/consent';
import { dateLabel } from '@/lib/dates';

const LOCK_OPTIONS: { value: LockMode; label: string }[] = [
  { value: 'off', label: 'Off' }, { value: 'app', label: 'Opening the app' }, { value: 'records', label: 'Records only' },
];

/** Figma "HealthHub / Privacy and data": consents, the app lock, and taking your data out or away. */
export default function PrivacyScreen() {
  const toast = useToast();
  const { signOut } = useAuth();
  const consents = useConsents();
  const { data: rows = [] } = useConsentRows();
  const setConsents = useSetConsents();
  const { mode, setMode } = useAppLock();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const guardians = rows.filter((r) => r.purpose.startsWith('guardian:') && !r.withdrawn_at).length;
  const grantedOn = (p: Purpose) => rows.find((r) => r.purpose === p && !r.withdrawn_at)?.granted_at;

  const toggle = (p: Purpose, on: boolean) =>
    setConsents.mutate(on ? { grant: [p] } : { withdraw: [p] }, {
      onSuccess: () => toast({ message: on ? 'Consent given' : 'Consent withdrawn. We’ll ask again before using it.' }),
      onError: () => toast({ message: 'Couldn’t save that. Try again.', type: 'error' }),
    });

  const changeLock = async (next: LockMode) => {
    if (next === mode) return;
    if (next !== 'off') {
      const s = await lockSupport();
      if (!s.ok) return toast({ message: s.reason!, type: 'error' });
    }
    // prove it's them before changing it either way
    if (Platform.OS !== 'web' && (next !== 'off' || mode !== 'off')) {
      const r = await authenticate(next === 'off' ? 'Turn off the app lock' : 'Turn on the app lock');
      if (!r.ok) return;
    }
    setMode(next);
    toast({ message: next === 'off' ? 'App lock is off' : 'App lock is on' });
  };

  const download = async () => {
    setExporting(true);
    try {
      await downloadMyData();
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Couldn’t prepare your data.', type: 'error' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <SettingsScreen title="Privacy and data">
      <InfoNote tone="teal" icon="Lock">
        Your family&apos;s records are private to your account. We never sell health data, and we don&apos;t share it with anyone without your say-so.
      </InfoNote>

      <SettingsGroup
        title="What you've agreed to"
        footer={guardians ? `You've confirmed you're the parent or guardian of ${guardians} ${guardians === 1 ? 'child' : 'children'}.` : undefined}>
        {consents.isPending ? (
          <View style={{ padding: Space.lg, gap: Space.md }}><Skeleton width="70%" height={20} /><Skeleton width="55%" height={20} /></View>
        ) : (
          PURPOSES.map((p, i) => {
            const at = grantedOn(p.id);
            return p.required ? (
              <ListRow
                key={p.id}
                icon="Shield Tick"
                label={p.title}
                value={at ? `Since ${dateLabel(at.slice(0, 10))}` : undefined}
                onPress={() => toast({ message: 'This one is needed to use HealthHub. To withdraw it, delete your account.' })}
              />
            ) : (
              <SwitchRow
                key={p.id}
                label={p.title}
                description={p.why}
                value={consents.has(p.id)}
                onValueChange={(v) => toggle(p.id, v)}
                divider={i < PURPOSES.length - 1}
              />
            );
          })
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Require unlock"
        footer={Platform.OS === 'web' ? 'The app lock works in the phone app.' : 'Uses your fingerprint, face or phone PIN. Locks again after a minute away.'}>
        <View style={{ padding: Space.lg }}>
          <ChipGroup label="When" options={LOCK_OPTIONS} value={mode} onChange={changeLock} />
        </View>
      </SettingsGroup>

      <SettingsGroup title="Your data">
        <ListRow icon="Download" label={exporting ? 'Preparing your data…' : 'Download my data'} value="Zip: data + files" onPress={exporting ? undefined : download} />
        <ListRow icon="Trash" label="Delete my account" danger divider={false} onPress={() => setDeleting(true)} />
      </SettingsGroup>

      <View style={{ gap: Space.sm }}>
        <Text style={[Type.bodyMedium, { color: C.text }]}>What we store</Text>
        <Text style={[Type.body, { color: C.textSecondary }]}>
          Your family members&apos; names, dates of birth and health details; the records you upload; and your bookings and reminders.
          Payment details stay with the payment provider — HealthHub never sees your card number.
        </Text>
      </View>

      <DeleteAccountDialog
        visible={deleting}
        onCancel={() => setDeleting(false)}
        onDeleted={async () => {
          setDeleting(false);
          await signOut();
          toast({ message: 'Your account and everything in it has been deleted' });
        }}
      />
    </SettingsScreen>
  );
}

/** Deleting is permanent, so it takes typing DELETE (checked again on the server). */
function DeleteAccountDialog({ visible, onCancel, onDeleted }: { visible: boolean; onCancel: () => void; onDeleted: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = text.trim() === 'DELETE';

  const close = () => { if (busy) return; setText(''); setError(null); onCancel(); };
  const run = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount();
      setText('');
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.scrim} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close dialog" accessibilityRole="button" />
        <View style={styles.dialog} accessibilityViewIsModal>
          <Text style={[Type.heading, { color: C.text }]} accessibilityRole="header">Delete your account?</Text>
          <Text style={[Type.body, { color: C.textSecondary }]}>
            Every family member, record and file, booking and reminder will be permanently removed, and upcoming doctor slots are released.
            This can&apos;t be undone. Download your data first if you want a copy.
          </Text>
          <Field
            label="Type DELETE to confirm"
            value={text}
            onChangeText={(v) => { setText(v); setError(null); }}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="DELETE"
            error={error ?? undefined}
          />
          <View style={styles.actions}>
            <Button label="Keep my account" variant="secondary" size="M" fill onPress={close} disabled={busy} />
            <Button label="Delete forever" variant="danger" size="M" fill disabled={!ok} loading={busy} onPress={run} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: C.scrim, alignItems: 'center', justifyContent: 'center', padding: Space.xl },
  dialog: { width: '100%', maxWidth: 420, backgroundColor: C.card, borderRadius: Radius.sheet, padding: Space.xl, gap: Space.lg },
  actions: { flexDirection: 'row', gap: Space.md },
});
