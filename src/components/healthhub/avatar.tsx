import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { C, Type } from '@/constants/healthhub';

import { Icon } from './icon';

export type AvatarTone = 'navy' | 'teal' | 'amber';
const TONES: Record<AvatarTone, [string, string]> = {
  navy: [C.primarySoft, C.primary],
  teal: [C.tealSoft, C.tealText],
  amber: [C.warningSoft, C.warningText],
};
const SIZES = { S: 32, M: 48, L: 72 } as const;

/**
 * Illustrated faces for the sample family on the demo account, keyed by lower-case first name.
 * Anyone else (and any member with a real photo) keeps the photo → initial → icon fallback.
 */
const SAMPLE_FACES: Record<string, number> = {
  aarav: require('@/assets/images/avatars/aarav.webp'),
  priya: require('@/assets/images/avatars/priya.webp'),
  kabir: require('@/assets/images/avatars/kabir.webp'),
  sunita: require('@/assets/images/avatars/sunita.webp'),
};
const sampleFace = (name?: string) => (name ? SAMPLE_FACES[name.trim().split(/\s+/)[0].toLowerCase()] : undefined);

/** First letter of the first name (one family shares a surname, so a single initial reads best). */
export function initialOf(name: string) {
  return (name.trim()[0] ?? '?').toUpperCase();
}

/**
 * Figma "Avatar": photo → initial monogram → person icon, on a soft tone.
 * Decorative next to a visible name; pass `label` when it stands alone.
 */
export function Avatar({
  name,
  initials,
  photo,
  size = 'M',
  tone = 'navy',
  label,
}: {
  name?: string;
  /** override, e.g. "AR" for a doctor */
  initials?: string;
  photo?: string | null;
  size?: keyof typeof SIZES;
  tone?: AvatarTone;
  label?: string;
}) {
  const [failed, setFailed] = useState(false);
  const px = SIZES[size];
  const [bg, fg] = TONES[tone];
  const text = initials ?? (name ? initialOf(name) : '');
  const type = size === 'L' ? Type.title : size === 'M' ? Type.subheading : Type.micro;

  return (
    <View
      style={[styles.circle, { width: px, height: px, borderRadius: px / 2, backgroundColor: bg }]}
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}>
      {photo && !failed ? (
        <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" onError={() => setFailed(true)} />
      ) : !initials && sampleFace(name) ? (
        <Image source={sampleFace(name)} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : text ? (
        <Text style={[type, { color: fg }]} allowFontScaling={false}>
          {text}
        </Text>
      ) : (
        <Icon name="User" size={Math.round(px * 0.5)} color={fg} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
