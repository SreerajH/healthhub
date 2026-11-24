import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { C } from '@/constants/healthhub';

import { ICON_SHAPES, type IconName } from './icon-shapes';

export type { IconName };

/**
 * HealthHub icon: the same 24px iconsax-style Linear drawings as the Figma kit (generated into
 * icon-shapes.ts), rendered with react-native-svg so they are pixel-centred on every platform.
 * Decorative by default; give `accessibilityLabel` when the icon carries meaning on its own.
 */
export function Icon({
  name,
  size = 24,
  color = C.text,
  strokeWidth,
  accessibilityLabel,
}: {
  name: IconName;
  size?: number;
  color?: string;
  /** default 1.5 at 24px; thicker for large illustration icons */
  strokeWidth?: number;
  accessibilityLabel?: string;
}) {
  const icon = ICON_SHAPES[name];
  const sw = strokeWidth ?? (size >= 64 ? 2 : 1.5);
  const paint = icon.filled
    ? { fill: color, stroke: 'none' }
    : { fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  // accessibility lives on a View (react-native-svg forwards unknown props to the DOM <svg> on web)
  return (
    <View
      style={{ width: size, height: size }}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      aria-hidden={!accessibilityLabel}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {icon.shapes.map(([kind, a], i) => {
          if (kind === 'path') return <Path key={i} d={String(a.d)} {...paint} />;
          if (kind === 'circle') return <Circle key={i} cx={a.cx} cy={a.cy} r={a.r} {...paint} />;
          return <Rect key={i} x={a.x} y={a.y} width={a.width} height={a.height} rx={a.rx} {...paint} />;
        })}
      </Svg>
    </View>
  );
}
