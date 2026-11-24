import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { C, Radius, Space, Type } from '@/constants/healthhub';

import { TopBar } from './forms';

/** Scrolling settings page with a TopBar, used by the screens behind the Profile rows. */
export function SettingsScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.flex}>
      <TopBar title={title} />
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </View>
  );
}

export function SettingsGroup({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <View style={{ gap: Space.sm }}>
      {title ? <Text style={[Type.bodyMedium, { color: C.textSecondary }]} accessibilityRole="header">{title}</Text> : null}
      <View style={styles.group}>{children}</View>
      {footer ? <Text style={[Type.caption, { color: C.textSecondary }]}>{footer}</Text> : null}
    </View>
  );
}

/** A labelled switch row inside a SettingsGroup. */
export function SwitchRow({
  label, description, value, onValueChange, divider = true,
}: {
  label: string; description?: string; value: boolean; onValueChange: (v: boolean) => void; divider?: boolean;
}) {
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[Type.bodyMedium, { color: C.text }]}>{label}</Text>
        {description ? <Text style={[Type.caption, { color: C.textSecondary }]}>{description}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} accessibilityLabel={label}
        trackColor={{ true: C.primary, false: C.border }} thumbColor={C.card} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingTop: Space.sm, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  group: { borderRadius: Radius.card, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.lg, minHeight: 64 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
});
