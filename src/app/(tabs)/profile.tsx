import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  Avatar, Card, ConfirmDialog, HOME_COACH_STEPS, IconButton, ListRow, TabScreen, useCoachMarks, useToast, type IconName,
} from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { useBookings, useLoadSampleFamily, useMembers, useReminders } from '@/hooks';
import { useAuth } from '@/lib/auth';

type Row = { label: string; icon: IconName; value?: string; href?: Href; action?: 'tips' | 'sample' };

/** Figma "HealthHub / Profile": account header, then grouped settings. */
export default function ProfileScreen() {
  const { data: members = [] } = useMembers();
  const { data: reminders = [] } = useReminders();
  const { appointments, labBookings } = useBookings();
  const upcoming = appointments.filter((a) => a.status === 'upcoming').length + labBookings.filter((l) => l.status === 'upcoming').length;
  const me = members.find((m) => m.relation === 'self') ?? members[0] ?? null;
  const { profile, user, signOut } = useAuth();
  // the signed-in account is the source of truth for the header; family data is still local until C4
  const accountName = profile?.full_name || me?.name || '';
  const accountPhone = profile?.phone || user?.phone || user?.email || '';
  const toast = useToast();
  const { start } = useCoachMarks();
  const [confirm, setConfirm] = useState(false);
  const loadSample = useLoadSampleFamily();

  const groups: { title: string; rows: Row[] }[] = [
    {
      title: 'Family and health',
      rows: [
        { label: 'Family members', icon: 'People', value: `${members.length} ${members.length === 1 ? 'member' : 'members'}`, href: '/family' },
        { label: 'Bookings', icon: 'Calendar Tick', value: upcoming ? `${upcoming} upcoming` : 'None upcoming', href: '/bookings' },
        { label: 'Reminders', icon: 'Alarm', value: `${reminders.length} active`, href: '/reminders' },
        { label: 'Link ABHA', icon: 'ID Card', value: 'Not linked', href: '/settings/abha' },
      ],
    },
    {
      title: 'Account',
      rows: [
        { label: 'Notifications', icon: 'Bell', href: '/settings/notifications' },
        { label: 'Payment methods', icon: 'Card', value: 'UPI', href: '/settings/payment' },
        { label: 'Privacy and data', icon: 'Lock', href: '/settings/privacy' },
      ],
    },
    {
      title: 'Support',
      rows: [
        { label: 'Help and support', icon: 'Help', href: '/settings/help' },
        { label: 'About HealthHub', icon: 'Info', href: '/settings/about' },
        { label: 'Replay app tips', icon: 'Refresh', action: 'tips' },
        // demo only, and only while the account has no family yet
        ...(members.length <= 1 ? [{ label: 'Load sample family', icon: 'People' as const, value: 'Demo', action: 'sample' as const }] : []),
      ],
    },
  ];

  const openRow = (r: Row) => {
    if (r.action === 'sample') {
      loadSample.mutate(undefined, {
        onSuccess: () => toast({ message: 'Sample family added: Priya, Kabir and Sunita' }),
        onError: (e) => toast({ message: e.message, type: 'error' }),
      });
      return;
    }
    if (r.action === 'tips') {
      router.navigate('/');
      // let Home mount and measure before the spotlight appears
      setTimeout(() => start(HOME_COACH_STEPS), 500);
      return;
    }
    if (r.href) router.push(r.href);
  };

  return (
    <TabScreen title="Profile">
      <Card>
        <View style={styles.account}>
          <Avatar name={accountName || undefined} photo={me?.photo} size="L" tone={me?.tone ?? 'navy'} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[Type.heading, { color: C.text }]}>{accountName}</Text>
            <Text style={[Type.caption, { color: C.textSecondary }]}>{accountPhone}</Text>
          </View>
          <IconButton icon="Edit" variant="soft" accessibilityLabel="Edit profile"
            onPress={() => router.push(me ? { pathname: '/family/edit', params: { id: me.id } } : '/family/edit')} />
        </View>
      </Card>

      {groups.map((g) => (
        <View key={g.title} style={{ gap: Space.sm }}>
          <Text style={[Type.bodyMedium, { color: C.textSecondary }]}>{g.title}</Text>
          <View style={styles.group}>
            {g.rows.map((r, i) => (
              <ListRow key={r.label} icon={r.icon} label={r.label} value={r.value} divider={i < g.rows.length - 1} onPress={() => openRow(r)} />
            ))}
          </View>
        </View>
      ))}

      <View style={styles.group}>
        <ListRow icon="Logout" label="Log out" danger divider={false} onPress={() => setConfirm(true)} />
      </View>
      <Text style={[Type.caption, { color: C.textSecondary, textAlign: 'center' }]}>HealthHub · version 1.0</Text>

      <ConfirmDialog
        visible={confirm}
        icon="Logout"
        title="Log out of HealthHub?"
        message="Your family's records stay safe in your account. You'll need your phone number to sign back in."
        confirmLabel="Log out"
        cancelLabel="Stay"
        onCancel={() => setConfirm(false)}
        onConfirm={async () => { setConfirm(false); await signOut(); toast({ message: 'Signed out' }); }}
      />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  account: { flexDirection: 'row', alignItems: 'center', gap: Space.lg },
  group: { borderRadius: Radius.card, borderWidth: 1, borderColor: C.border, overflow: 'hidden', backgroundColor: C.card },
});
