import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, C, Radius, Shadow, Space, Type } from '@/constants/healthhub';

import { Button } from './button';
import { Icon, type IconName } from './icon';

/**
 * Figma "EmptyState": friendly illustration (never the 🚫 icon), title, one sentence of value,
 * primary button directly below. No red hint boxes.
 */
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  actionIcon,
  onAction,
  badge = true,
}: {
  icon: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
  badge?: boolean;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.illustration}>
        <Icon name={icon} size={72} color={C.primary} />
        {badge ? (
          <View style={styles.badge}>
            <Icon name="Plus" size={20} color={C.tealText} />
          </View>
        ) : null}
      </View>
      <Text style={[Type.heading, styles.center, { color: C.text }]} accessibilityRole="header">
        {title}
      </Text>
      <Text style={[Type.body, styles.center, { color: C.textSecondary, maxWidth: 320 }]}>{message}</Text>
      {actionLabel ? <Button label={actionLabel} icon={actionIcon} onPress={onAction} style={{ marginTop: Space.sm }} /> : null}
    </View>
  );
}

/**
 * Something went wrong fetching data. Never a red box: a plain explanation and a way to try again,
 * because a health app that looks broken feels unsafe.
 */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={[styles.illustration, { backgroundColor: C.warningSoft }]}>
        <Icon name="Wifi Off" size={64} color={C.warningText} />
      </View>
      <Text style={[Type.heading, styles.center, { color: C.text }]} accessibilityRole="header">
        Couldn&apos;t load this
      </Text>
      <Text style={[Type.body, styles.center, { color: C.textSecondary, maxWidth: 320 }]}>
        {message ?? 'Check your connection and try again. Nothing has been lost.'}
      </Text>
      {onRetry ? <Button label="Try again" icon="Refresh" variant="secondary" onPress={onRetry} style={{ marginTop: Space.sm }} /> : null}
    </View>
  );
}

/** Loading placeholder block. Gently pulses; stays still with reduced motion. */
export function Skeleton({ width, height, radius = 8 }: { width: DimensionValue; height: number; radius?: number }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduce) o.value = withRepeat(withTiming(0.55, { duration: 700 }), -1, true);
  }, [reduce, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: C.border }, anim]} />;
}

/** Figma "ConfirmDialog": destructive confirm with plain-language consequence. */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Keep it',
  icon = 'Trash',
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  /** danger (the default) for destructive actions; primary for an ordinary yes/no */
  tone?: 'danger' | 'primary';
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: IconName;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.scrim}>
        {/* tap outside to close: a sibling layer, so the dialog's buttons aren't nested inside another button */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Close dialog" accessibilityRole="button" />
        <View style={styles.dialog} accessibilityViewIsModal>
          <View style={[styles.dangerCircle, tone === 'primary' && { backgroundColor: C.primarySoft }]}>
            <Icon name={icon} size={26} color={tone === 'primary' ? C.primary : C.dangerText} />
          </View>
          <Text style={[Type.heading, styles.center, { color: C.text }]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[Type.body, styles.center, { color: C.textSecondary }]}>{message}</Text>
          <View style={styles.actions}>
            <Button label={cancelLabel} variant="secondary" size="M" fill onPress={onCancel} />
            <Button label={confirmLabel} variant={tone === 'primary' ? 'primary' : 'danger'} size="M" fill onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------- Toast ----------
type ToastInput = { message: string; type?: 'success' | 'error'; actionLabel?: string; onAction?: () => void };
type ToastState = ToastInput & { id: number };
const ToastContext = createContext<(t: ToastInput) => void>(() => {});

/** Figma "Toast": dark, short message + one action, sits above the tab bar for 3.5 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback((t: ToastInput) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ ...t, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const value = useMemo(() => show, [show]);
  const ok = toast?.type !== 'error';

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.id}
          entering={FadeInDown.duration(220)}
          exiting={FadeOutDown.duration(180)}
          style={[styles.toastWrap, { bottom: insets.bottom + BottomTabInset - 24 }]}
          pointerEvents="box-none">
          <View style={styles.toast} accessibilityLiveRegion="polite" accessibilityRole="alert">
            <Icon name={ok ? 'Tick Circle' : 'Warning'} size={22} color={ok ? C.teal : C.dangerSoft} />
            <Text style={[Type.bodyMedium, { color: C.textInverse, flex: 1 }]} numberOfLines={2}>
              {toast.message}
            </Text>
            {toast.actionLabel ? (
              <Pressable
                onPress={() => { toast.onAction?.(); setToast(null); }}
                accessibilityRole="button"
                style={styles.toastAction}>
                <Text style={[Type.bodyMedium, { color: C.primarySoft }]}>{toast.actionLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.screen },
  illustration: {
    width: 160, height: 160, borderRadius: 80, backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: Space.lg,
  },
  badge: {
    position: 'absolute', top: 4, right: 4, width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.tealSoft, alignItems: 'center', justifyContent: 'center',
  },
  scrim: { flex: 1, backgroundColor: C.scrim, alignItems: 'center', justifyContent: 'center', padding: 32 },
  dialog: {
    width: '100%', maxWidth: 360, backgroundColor: C.card, borderRadius: Radius.sheet, padding: Space.xxl,
    alignItems: 'center', gap: Space.lg, boxShadow: Shadow.float,
  },
  dangerCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: Space.md, alignSelf: 'stretch' },
  toastWrap: { position: 'absolute', left: Space.screen, right: Space.screen, alignItems: 'center' },
  toast: {
    width: '100%', maxWidth: 440, flexDirection: 'row', alignItems: 'center', gap: Space.md,
    paddingVertical: Space.md, paddingLeft: Space.lg, paddingRight: Space.sm,
    borderRadius: Radius.button, backgroundColor: C.text, boxShadow: Shadow.float,
  },
  toastAction: { minHeight: 44, minWidth: 44, paddingHorizontal: Space.sm, justifyContent: 'center' },
});
