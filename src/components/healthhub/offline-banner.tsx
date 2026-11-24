import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C } from '@/constants/healthhub';

import { useToast } from './feedback';

// React Query pauses fetches while offline and retries them the moment the connection is back
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false)),
);

/**
 * Offline: the status-bar area turns dark for as long as it lasts (it sits in the safe-area inset, so it
 * never covers a header — the old floating pill did), and a toast says so once when the connection drops
 * and once when it's back. Text inside the status bar would collide with the clock or a punch-hole camera.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(onlineManager.isOnline());
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const wasOnline = useRef(online);

  useEffect(() => onlineManager.subscribe((now) => {
    setOnline(now);
    if (now === wasOnline.current) return;
    wasOnline.current = now;
    toast(now
      ? { message: 'Back online' }
      : { message: 'You’re offline. Showing what’s already saved.', type: 'error' });
  }), [toast]);

  if (online) return null;
  return (
    <>
      <StatusBar style="light" />
      <View style={[styles.strip, { height: insets.top }]} pointerEvents="none" />
    </>
  );
}

const styles = StyleSheet.create({
  strip: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: C.text },
});
