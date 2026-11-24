import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, Icon, TopBar } from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { useBookings, useDoctors, useLabPackages, useRecords, useReminders , useMembers } from '@/hooks';

import { buildNotifications, type Note } from '@/lib/notifications';



/** Figma "HealthHub / Notifications": grouped Today / Earlier, unread dots. */
export default function NotificationsScreen() {
  const { appointments } = useBookings();
  const { labBookings } = useBookings();
  const { data: reminders = [] } = useReminders();
  const { data: members = [] } = useMembers();
  const recordsCount = (useRecords().data ?? []).length;
  const { data: doctors = [] } = useDoctors();
  const { data: packages = [] } = useLabPackages();

  const notes = useMemo(
    () => buildNotifications({ appointments, labBookings, reminders, members, recordsCount, doctors, packages }),
    [appointments, labBookings, reminders, members, recordsCount, doctors, packages],
  );
  const [read, setRead] = useState<string[]>([]);
  const groups = useMemo(() => ['Today', 'Earlier'].map((g) => ({ title: g, items: notes.filter((n) => n.group === g) })).filter((g) => g.items.length), [notes]);
  const unread = notes.filter((n) => n.unread && !read.includes(n.id)).length;

  const open = (n: Note) => {
    setRead((r) => (r.includes(n.id) ? r : [...r, n.id]));
    if (n.href) router.push(n.href as never);
  };

  return (
    <View style={styles.flex}>
      <TopBar
        title="Notifications"
        action={unread ? { icon: 'Tick', label: 'Mark all as read', onPress: () => setRead(notes.map((n) => n.id)) } : undefined}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {notes.length ? (
          groups.map((g) => (
            <View key={g.title} style={{ gap: Space.sm }}>
              <Text style={[Type.bodyMedium, { color: C.textSecondary }]} accessibilityRole="header">{g.title}</Text>
              <View style={styles.group}>
                {g.items.map((n, i) => {
                  const isUnread = n.unread && !read.includes(n.id);
                  return (
                    <Pressable
                      key={n.id}
                      onPress={() => open(n)}
                      accessibilityRole="button"
                      accessibilityLabel={`${isUnread ? 'Unread. ' : ''}${n.title}. ${n.body} ${n.when}`}
                      style={({ pressed }) => [styles.note, isUnread && styles.unread, i > 0 && styles.divider, pressed && { backgroundColor: C.background }]}>
                      <View style={[styles.icon, { backgroundColor: n.bg }]}>
                        <Icon name={n.icon} size={22} color={n.fg} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[Type.subheading, { color: C.text }]}>{n.title}</Text>
                        <Text style={[Type.body, { color: C.textSecondary }]}>{n.body}</Text>
                        <Text style={[Type.micro, { color: C.textSecondary }]}>{n.when}</Text>
                      </View>
                      {isUnread ? <View style={styles.dot} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        ) : (
          <View style={{ paddingTop: 64 }}>
            <EmptyState icon="Bell" badge={false} title="No notifications"
              message="Reminders, booking updates and ready reports will appear here." />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.sm, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  group: { borderRadius: Radius.card, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, overflow: 'hidden' },
  note: { flexDirection: 'row', gap: Space.md, padding: Space.lg, alignItems: 'flex-start' },
  unread: { backgroundColor: C.primarySoft },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary, marginTop: 6 },
});
