import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { C, Radius, Type } from '@/constants/healthhub';

import { Icon, type IconName } from './icon';

export type ButtonVariant = 'primary' | 'secondary' | 'positive' | 'ghost' | 'danger' | 'dangerGhost';

const COLORS: Record<ButtonVariant, { bg: string; fg: string }> = {
  primary: { bg: C.primary, fg: C.textInverse },
  secondary: { bg: C.primarySoft, fg: C.primary },
  // health actions: mark as taken, book a test (teal, white text at 5.2:1)
  positive: { bg: C.tealText, fg: C.textInverse },
  ghost: { bg: 'transparent', fg: C.primary },
  danger: { bg: C.danger, fg: C.textInverse },
  dangerGhost: { bg: 'transparent', fg: C.dangerText },
};

/**
 * Figma "Button": L = 52px (Subheading/16), M = 44px (Body/14 Medium), radius/button.
 * Danger Ghost is for cancel-type actions; Danger is only for the final destructive confirm.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'L',
  icon,
  disabled,
  loading,
  fill,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'L' | 'M';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  /** stretch to the parent width */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const c = COLORS[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        size === 'L' ? styles.l : styles.m,
        { backgroundColor: c.bg },
        fill && styles.fill,
        inactive && styles.disabled,
        pressed && !inactive && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={20} color={c.fg} /> : null}
          <Text style={[size === 'L' ? Type.subheading : Type.bodyMedium, { color: c.fg }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: Radius.button, alignItems: 'center', justifyContent: 'center' },
  l: { height: 52, paddingHorizontal: 24 },
  m: { height: 44, paddingHorizontal: 20 },
  fill: { alignSelf: 'stretch', flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
