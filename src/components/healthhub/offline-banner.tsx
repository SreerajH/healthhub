import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, Radius, Space, Type } from '@/constants/healthhub';

import { Icon } from './icon';

// React Query pauses fetches while offline and retries them the moment the connection is back
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false)),
);

/** A small strip at the top while there's no connection; what's already loaded stays on screen. */
export function OfflineBanner() {
  const [online, setOnline] = useState(onlineManager.isOnline());
  const insets = useSafeAreaInsets();
  useEffect(() => onlineManager.subscribe(setOnline), []);
  if (online) return null;
  return (
    <View style={[styles.wrap, { top: insets.top + Space.xs }]} pointerEvents="none">
      <View style={styles.pill} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Icon name="Warning" size={18} color={C.textInverse} />
        <Text style={[Type.caption, { color: C.textInverse }]}>You&apos;re offline. Showing what&apos;s already loaded.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.lg, paddingVertical: Space.sm,
    borderRadius: Radius.pill, backgroundColor: C.text,
  },
});
