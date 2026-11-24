import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { C, Font } from '@/constants/healthhub';

// Must match app.json → expo-splash-screen (backgroundColor + imageWidth) so the hand-off is seamless.
const SPLASH_BG = C.primary;
const MARK_SIZE = 96;

/**
 * Figma "HealthHub / Splash": the native splash shows the mark; this overlay takes over in the same spot,
 * lifts the mark, fades in the wordmark and tagline, then fades away to reveal the app.
 * With reduced motion it simply fades out after a short pause.
 */
export function SplashOverlay() {
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const reduce = useReducedMotion();

  const lift = useSharedValue(0);
  const textIn = useSharedValue(reduce ? 1 : 0);
  const fadeOut = useSharedValue(1);

  // safety net: never let the overlay trap the app if the fade can't run
  // (a backgrounded tab freezes requestAnimationFrame, so the timing animation never finishes)
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!reduce) {
      lift.value = withTiming(-48, { duration: 520, easing: Easing.out(Easing.cubic) });
      textIn.value = withDelay(160, withTiming(1, { duration: 460 }));
    }
    fadeOut.value = withDelay(
      reduce ? 600 : 1400,
      withTiming(0, { duration: 360 }, (finished) => {
        if (finished) scheduleOnRN(setVisible, false);
      }),
    );
  }, [ready, reduce, lift, textIn, fadeOut]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: fadeOut.value }));
  const markStyle = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: textIn.value,
    transform: [{ translateY: (1 - textIn.value) * 12 }],
  }));

  if (!visible) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.overlay, overlayStyle]}
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => setReady(true));
      }}>
      <Animated.View style={markStyle}>
        <Image source={require('@/assets/images/splash-icon.png')} style={styles.mark} contentFit="contain" />
      </Animated.View>
      <Animated.View style={[styles.textBlock, textStyle]}>
        <Text style={styles.wordmark} allowFontScaling={false}>
          HealthHub
        </Text>
        <Text style={styles.tagline} allowFontScaling={false}>
          Your family&apos;s health, organised
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: SPLASH_BG,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  mark: { width: MARK_SIZE, height: MARK_SIZE },
  textBlock: { position: 'absolute', top: '50%', marginTop: 24, alignItems: 'center', gap: 8 },
  wordmark: { fontFamily: Font.bold, fontSize: 28, lineHeight: 34, color: C.textInverse },
  tagline: { fontFamily: Font.regular, fontSize: 15, lineHeight: 22, color: C.primarySoft },
});
