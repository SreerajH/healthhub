import { StyleSheet, Text, View } from 'react-native';

import { C, Radius, Space, Type } from '@/constants/healthhub';
import type { AppointmentStatus } from '@/data/types';

import { Avatar, type AvatarTone } from './avatar';
import { Button } from './button';
import { Card, StatusPill, Tag } from './controls';
import { Icon } from './icon';

export type BookingRow = {
  id: string;
  kind: 'doctor' | 'lab';
  status: AppointmentStatus;
  at: string;
  title: string;
  subtitle: string;
  forLine: string;
  avatar?: { initials: string; tone: AvatarTone };
  tags?: { label: string; icon: 'Home' | 'Clock'; tone: 'teal' | 'amber' }[];
};

/**
 * Figma "AppointmentCard" / lab booking card: who and where, then a date+time strip,
 * then the actions for that booking.
 */
export function BookingCard({
  row, dateLabel, timeLabel, statusLabel, onPress, onReschedule, onCancel, actionLabel = 'View details',
}: {
  row: BookingRow;
  dateLabel: string;
  timeLabel: string;
  statusLabel?: string;
  onPress: () => void;
  onReschedule?: () => void;
  onCancel?: () => void;
  actionLabel?: string;
}) {
  const past = row.status !== 'upcoming';
  return (
    <Card onPress={onPress} accessibilityLabel={`${row.title}, ${row.subtitle}, ${row.forLine}, ${dateLabel} at ${timeLabel}`}>
      <View style={{ gap: Space.md }}>
        <View style={styles.top}>
          {row.avatar ? (
            <Avatar initials={row.avatar.initials} tone={row.avatar.tone} size="M" />
          ) : (
            <View style={styles.labTile}><Icon name="Flask" color={C.tealText} /></View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            {row.kind === 'lab' ? <Text style={[Type.micro, { color: C.tealText }]}>Lab test</Text> : null}
            <Text style={[Type.subheading, { color: C.text }]} numberOfLines={1}>{row.title}</Text>
            <Text style={[Type.caption, { color: C.textSecondary }]} numberOfLines={1}>{row.subtitle}</Text>
            <Text style={[Type.caption, { color: C.primary }]} numberOfLines={1}>{row.forLine}</Text>
          </View>
          <StatusPill status={row.status} label={statusLabel} />
        </View>

        <View style={styles.when}>
          <Icon name="Calendar" size={20} color={C.primary} />
          <Text style={[Type.subheading, { color: C.text }]}>{dateLabel}</Text>
          <Text style={[Type.body, { color: C.textSecondary }]}>·</Text>
          <Icon name="Clock" size={20} color={C.primary} />
          <Text style={[Type.subheading, { color: C.text }]}>{timeLabel}</Text>
        </View>

        {row.tags?.length ? (
          <View style={styles.tags}>
            {row.tags.map((t) => <Tag key={t.label} label={t.label} icon={t.icon} tone={t.tone} />)}
          </View>
        ) : null}

        {past ? null : onReschedule || onCancel ? (
          <View style={styles.actions}>
            {onReschedule ? <Button label="Reschedule" variant="secondary" size="M" fill style={{ flex: 1 }} onPress={onReschedule} /> : null}
            {onCancel ? <Button label="Cancel" variant="dangerGhost" size="M" onPress={onCancel} /> : null}
          </View>
        ) : (
          <Button label={actionLabel} variant="secondary" size="M" fill onPress={onPress} />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', gap: Space.md },
  labTile: { width: 48, height: 48, borderRadius: Radius.button, backgroundColor: C.tealSoft, alignItems: 'center', justifyContent: 'center' },
  when: {
    flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.md, paddingHorizontal: Space.lg,
    borderRadius: Radius.button, backgroundColor: C.primarySoft,
  },
  tags: { flexDirection: 'row', gap: Space.sm, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', gap: Space.sm, alignItems: 'center' },
});
