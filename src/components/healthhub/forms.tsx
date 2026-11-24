import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, Radius, Shadow, Space, Type } from '@/constants/healthhub';

import { Chip, IconButton } from './controls';
import { Icon, type IconName } from './icon';

/** Figma "TopBar": back, centred title, optional action — for pushed screens. */
export function TopBar({
  title,
  action,
  onBack = () => (router.canGoBack() ? router.back() : router.replace('/')),
}: {
  title: string;
  action?: { icon: IconName; label: string; onPress: () => void };
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.topBar, { paddingTop: insets.top }]}>
      <IconButton icon="Arrow Left" accessibilityLabel="Back" onPress={onBack} />
      <Text style={[Type.subheading, styles.topTitle]} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      {action ? <IconButton icon={action.icon} accessibilityLabel={action.label} onPress={action.onPress} /> : <View style={{ width: 44 }} />}
    </View>
  );
}

/** Figma "Input": Body/14 label, 52px field with border/strong (3.3:1), helper or error below. */
export function Field({
  label,
  helper,
  error,
  ...input
}: TextInputProps & { label: string; helper?: string; error?: string | null }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: Space.sm }}>
      <Text style={[Type.bodyMedium, { color: C.text }]} nativeID={`${label}-label`}>
        {label}
      </Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        accessibilityHint={error ?? helper}
        onFocus={(e) => { setFocused(true); input.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
        placeholderTextColor={C.textSecondary}
        style={[Type.body, styles.input, focused && styles.inputFocus, !!error && styles.inputError, input.style]}
      />
      <HelperText helper={helper} error={error} />
    </View>
  );
}

export function HelperText({ helper, error }: { helper?: string; error?: string | null }) {
  if (error) {
    return (
      <View style={styles.helper} accessibilityLiveRegion="polite">
        <Icon name="Info" size={16} color={C.dangerText} />
        <Text style={[Type.caption, { color: C.dangerText, flex: 1 }]}>{error}</Text>
      </View>
    );
  }
  return helper ? <Text style={[Type.caption, { color: C.textSecondary }]}>{helper}</Text> : null;
}

/** Single- or multi-select chip group with a label (relation, blood group, allergies…). */
export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  extra,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | T[] | null;
  onChange: (v: T) => void;
  error?: string | null;
  extra?: ReactNode;
}) {
  const isOn = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <View style={{ gap: Space.xs }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={[Type.bodyMedium, { color: C.text }]}>{label}</Text>
      <View style={styles.chips}>
        {options.map((o) => (
          <Chip key={o.value} label={o.label} active={isOn(o.value)} onPress={() => onChange(o.value)} />
        ))}
        {extra}
      </View>
      <HelperText error={error} />
    </View>
  );
}

/** Checkbox row (e.g. guardian consent). */
export function CheckRow({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked }} style={styles.check}>
      <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Icon name="Tick" size={16} color={C.textInverse} /> : null}</View>
      <Text style={[Type.bodyMedium, { color: C.text, flex: 1 }]}>{children}</Text>
    </Pressable>
  );
}

/** Bottom action sheet (used for the ⋯ menu). */
export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: { label: string; icon: IconName; onPress: () => void; danger?: boolean }[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Space.lg }]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          {title ? <Text style={[Type.subheading, { color: C.text, paddingHorizontal: Space.lg }]}>{title}</Text> : null}
          {actions.map((a) => (
            <Pressable
              key={a.label}
              // let the sheet finish closing first: iOS can't present a new modal (e.g. a confirm dialog)
              // while this one is still dismissing, and on web the two would overlap mid-fade
              onPress={() => { onClose(); setTimeout(a.onPress, 280); }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: C.background }]}>
              <Icon name={a.icon} size={22} color={a.danger ? C.dangerText : C.text} />
              <Text style={[Type.body, { color: a.danger ? C.dangerText : C.text }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Space.sm, backgroundColor: C.background, minHeight: 56 },
  topTitle: { flex: 1, textAlign: 'center', color: C.text },
  input: {
    height: 52, borderRadius: Radius.button, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.card,
    paddingHorizontal: Space.lg, color: C.text, outlineWidth: 0,
  },
  inputFocus: { borderColor: C.primary, borderWidth: 2, paddingHorizontal: Space.lg - 1 },
  inputError: { borderColor: C.danger, borderWidth: 2, paddingHorizontal: Space.lg - 1 },
  helper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Space.sm },
  check: { flexDirection: 'row', gap: Space.md, padding: Space.md + 2, borderRadius: Radius.button, backgroundColor: C.primarySoft, alignItems: 'flex-start' },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: C.borderStrong, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.primary, borderColor: C.primary },
  scrim: { flex: 1, backgroundColor: C.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet,
    paddingTop: Space.sm, gap: 4, boxShadow: Shadow.float, width: '100%', maxWidth: 600, alignSelf: 'center',
  },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.borderStrong, alignSelf: 'center', marginBottom: Space.sm },
  sheetRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingHorizontal: Space.lg },
});
