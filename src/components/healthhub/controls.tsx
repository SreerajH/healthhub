import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { C, HitSize, Radius, Space, Type } from '@/constants/healthhub';

import { Icon, type IconName } from './icon';

/** Figma "Chip": 36px pill inside a 44px touch target. Active = navy. */
export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [styles.chip, active ? styles.chipOn : styles.chipOff, pressed && { opacity: 0.8 }]}>
      <Text style={[Type.bodyMedium, { color: active ? C.textInverse : C.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Figma "IconButton": 40px circle in a 44px target. Always pass an accessibilityLabel. */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'plain',
  badge,
}: {
  icon: IconName;
  onPress?: () => void;
  accessibilityLabel: string;
  variant?: 'plain' | 'soft' | 'primary';
  /** small unread dot */
  badge?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.iconHit, pressed && { opacity: 0.7 }]}>
      <View style={[styles.iconCircle, variant === 'soft' && styles.iconSoft, variant === 'primary' && { backgroundColor: C.primary }]}>
        <Icon name={icon} size={22} color={variant === 'primary' ? C.textInverse : C.text} />
      </View>
      {badge ? <View style={styles.badge} /> : null}
    </Pressable>
  );
}

/**
 * White card with the subtle outline used across the Figma screens.
 * A tappable card can hold its own buttons ("Book", "Directions"): on native the inner button takes its own
 * tap. On web, react-native-web renders role="button" as a <button>, and a <button> inside a <button> is
 * invalid HTML, so there the card is a focusable labelled element without the button role.
 */
export function Card({
  children,
  onPress,
  style,
  padding = Space.lg,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  accessibilityLabel?: string;
}) {
  if (!onPress) return <View style={[styles.card, { padding }, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.card, { padding }, pressed && styles.cardPressed, style]}>
      {children}
    </Pressable>
  );
}

/** Figma "SectionHeader": Heading/18 title + optional "See all" link (44px tall). */
export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <Text style={[Type.heading, { color: C.text, flexShrink: 1 }]} accessibilityRole="header">
        {title}
      </Text>
      {actionLabel ? (
        <Pressable onPress={onAction} accessibilityRole="link" style={styles.sectionLink}>
          <Text style={[Type.bodyMedium, { color: C.primary }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Figma "ListRow" / "ListRow Danger": 56px row, icon, label, optional value, chevron, divider. */
export function ListRow({
  icon,
  label,
  value,
  onPress,
  danger,
  divider = true,
  chevron = !danger,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  divider?: boolean;
  chevron?: boolean;
}) {
  const fg = danger ? C.dangerText : C.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.background }]}>
      <Icon name={icon} size={22} color={fg} />
      <Text style={[Type.body, { color: fg, flex: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      {value ? <Text style={[Type.caption, { color: C.textSecondary }]}>{value}</Text> : null}
      {chevron ? <Icon name="Chevron Right" size={20} color={C.textSecondary} /> : null}
      {divider ? <View style={styles.divider} /> : null}
    </Pressable>
  );
}

export type Status = 'upcoming' | 'completed' | 'cancelled' | 'dueSoon' | 'overdue' | 'verified';
const PILL: Record<Status, { label: string; bg: string; dot: string | null; fg: string; border?: string }> = {
  upcoming: { label: 'Upcoming', bg: C.primarySoft, dot: C.primary, fg: C.primary },
  completed: { label: 'Completed', bg: C.tealSoft, dot: C.teal, fg: C.tealText },
  cancelled: { label: 'Cancelled', bg: C.background, dot: C.textSecondary, fg: C.textSecondary, border: C.border },
  dueSoon: { label: 'Due soon', bg: C.warningSoft, dot: C.warning, fg: C.warningText },
  overdue: { label: 'Overdue', bg: C.dangerSoft, dot: C.danger, fg: C.dangerText },
  verified: { label: 'Verified', bg: C.tealSoft, dot: null, fg: C.tealText },
};

/** Figma "StatusPill": 24px, Micro/12 on a soft background; text colours all pass 4.5:1. */
export function StatusPill({ status, label }: { status: Status; label?: string }) {
  const p = PILL[status];
  return (
    <View style={[styles.pill, { backgroundColor: p.bg }, p.border ? { borderWidth: 1, borderColor: p.border } : null]}>
      {p.dot ? <View style={[styles.dot, { backgroundColor: p.dot }]} /> : <Icon name="Shield Tick" size={14} color={p.fg} />}
      <Text style={[Type.micro, { color: p.fg }]}>{label ?? p.label}</Text>
    </View>
  );
}

/** Small tinted tag with an icon ("Home collection", "B+", "Fast 10–12 h"). */
export function Tag({ label, icon, tone = 'navy' }: { label: string; icon: IconName; tone?: 'navy' | 'teal' | 'amber' | 'red' }) {
  const t = { navy: [C.primarySoft, C.primary], teal: [C.tealSoft, C.tealText], amber: [C.warningSoft, C.warningText], red: [C.dangerSoft, C.dangerText] }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t[0] }]}>
      <Icon name={icon} size={14} color={t[1]} />
      <Text style={[Type.micro, { color: t[1] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { height: 36, paddingHorizontal: 16, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
  chipOn: { backgroundColor: C.primary },
  chipOff: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  iconHit: { width: HitSize, height: HitSize, alignItems: 'center', justifyContent: 'center' },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconSoft: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  badge: { position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: C.danger, borderWidth: 2, borderColor: C.card },
  card: { backgroundColor: C.card, borderRadius: Radius.card, borderWidth: 1, borderColor: C.border },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: HitSize },
  sectionLink: { minHeight: HitSize, minWidth: HitSize, paddingHorizontal: 8, marginRight: -8, justifyContent: 'center' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, backgroundColor: C.card },
  divider: { position: 'absolute', left: 16, right: 16, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: C.border },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: Radius.pill, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
