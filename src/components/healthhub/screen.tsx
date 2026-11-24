import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, type ComponentRef, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type RefreshControlProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, C, Space, Type } from '@/constants/healthhub';

import { useCoachMarks } from './coach-marks';

/**
 * Scrolling tab screen: screen background, safe-area top padding, 20px sides,
 * and bottom padding so the last item clears the floating tab bar.
 */
export function TabScreen({
  title,
  right,
  children,
  refreshControl,
  gap = Space.xxl,
}: {
  /** Display/28 page title; omit for screens with their own header (Home) */
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  gap?: number;
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const offset = useRef(0);
  const { setScroller } = useCoachMarks();

  // while this tab is in front, let the tips tour scroll a spot into view
  useFocusEffect(
    useCallback(() => {
      setScroller((dy) => scrollRef.current?.scrollTo({ y: Math.max(0, offset.current + dy), animated: true }));
      return () => setScroller(null);
    }, [setScroller]),
  );

  return (
    <ScrollView
      ref={scrollRef}
      onScroll={(e) => { offset.current = e.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={32}
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Space.sm, paddingBottom: insets.bottom + BottomTabInset, gap }]}
      refreshControl={refreshControl}
      showsVerticalScrollIndicator={false}>
      {title ? (
        <View style={styles.header}>
          <Text style={[Type.display, { color: C.text, flexShrink: 1 }]} accessibilityRole="header">
            {title}
          </Text>
          {right}
        </View>
      ) : null}
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: Space.screen, width: '100%', maxWidth: 600, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
});
