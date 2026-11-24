import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, Radius, Shadow, TabBarGap, TabBarHeight, Type } from '@/constants/healthhub';

import { Icon, type IconName } from './icon';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Home', icon: 'Home' },
  records: { label: 'Records', icon: 'Document' },
  bookings: { label: 'Bookings', icon: 'Calendar Tick' },
  profile: { label: 'Profile', icon: 'User' },
};

/**
 * Figma "NavBar": a floating white bar (radius/sheet, soft shadow). Every tab has an icon and a label;
 * the active tab gets a navy pill behind a white icon and a navy label. Tabs are 72×56 (≥ 44px targets).
 */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + TabBarGap }]}>
      <View style={styles.bar} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          // same contract as expo-router 58's built-in tab bar (emitter + navigateToTab)
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <TabItem
              key={route.key}
              label={tab.label}
              icon={tab.icon}
              focused={focused}
              onPress={onPress}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? tab.label}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabItem({
  label, icon, focused, onPress, onLongPress, accessibilityLabel,
}: {
  label: string; icon: IconName; focused: boolean; onPress: () => void; onLongPress: () => void; accessibilityLabel: string;
}) {
  const reduce = useReducedMotion();
  const pill = useAnimatedStyle(
    () => ({
      opacity: reduce ? (focused ? 1 : 0) : withTiming(focused ? 1 : 0, { duration: 180 }),
      transform: [{ scaleX: reduce ? 1 : withSpring(focused ? 1 : 0.6, { damping: 16, stiffness: 240 }) }],
    }),
    [focused, reduce],
  );
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}>
      <View style={styles.iconWrap}>
        <Animated.View style={[styles.pill, pill]} />
        <Icon name={icon} size={22} color={focused ? C.textInverse : C.textSecondary} />
      </View>
      <Text style={[Type.micro, { color: focused ? C.primary : C.textSecondary }]} numberOfLines={1} allowFontScaling={false}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  bar: {
    width: '100%',
    maxWidth: 440,
    height: TabBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderRadius: Radius.sheet,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    boxShadow: Shadow.float,
  },
  item: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center', gap: 4 },
  iconWrap: { width: 56, height: 32, alignItems: 'center', justifyContent: 'center' },
  pill: { ...StyleSheet.absoluteFill, borderRadius: Radius.pill, backgroundColor: C.primary },
});
