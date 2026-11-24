// HealthHub design tokens — mirror the Figma "HealthHub/…" variables and text styles (A2).
// Light mode only (per the build guide). Every text style sets fontFamily per weight and never
// fontWeight: Android fake-bolds custom fonts when fontWeight is added on top.

/** HealthHub/Colors */
export const C = {
  // 2026-11-24 refresh: a deeper navy, teal promoted to a real second colour, one soft-lime highlight
  primary: '#1F2E5C', // navy: buttons, headings, active nav (13:1 on white)
  primarySoft: '#E8ECF7', // secondary actions only
  teal: '#14A38B', // success / verified fills and icons only (3.2:1, not for text)
  tealSoft: '#E3F5F1', // fill for positive actions (Taken, Book a test)
  tealText: '#0F7A68', // teal for text, and the fill of positive buttons (5.2:1 with white)
  highlight: '#E4F98A', // soft lime: one chip per screen on the navy hero card (DocNow-style), navy text on it
  heroTint: '#EEF0FF', // lavender wash behind the Home greeting
  warning: '#B7791F', // due-soon fills and icons only
  warningSoft: '#FDF3E1',
  warningText: '#94600F',
  danger: '#C93A3A', // errors and destructive actions only
  dangerSoft: '#FCEBEB',
  dangerText: '#B03030',
  text: '#1B2333',
  textSecondary: '#5B6475',
  textInverse: '#FFFFFF',
  background: '#F1F3F8', // a touch darker than before, so white cards stand clear
  card: '#FFFFFF',
  border: '#E4E7EF', // dividers, card outlines (decorative)
  borderStrong: '#858D9E', // input and control outlines (3.3:1)
  scrim: 'rgba(27, 35, 51, 0.5)',
} as const;

/** Instrument Sans (the Figma typeface), loaded in app/_layout.tsx */
export const Font = {
  regular: 'InstrumentSans-Regular',
  medium: 'InstrumentSans-Medium',
  semibold: 'InstrumentSans-SemiBold',
  bold: 'InstrumentSans-Bold',
} as const;

export const FontFiles = {
  [Font.regular]: require('@/assets/fonts/InstrumentSans_400Regular.ttf'),
  [Font.medium]: require('@/assets/fonts/InstrumentSans_500Medium.ttf'),
  [Font.semibold]: require('@/assets/fonts/InstrumentSans_600SemiBold.ttf'),
  [Font.bold]: require('@/assets/fonts/InstrumentSans_700Bold.ttf'),
};

/** HealthHub/ text styles. Nothing below 12px. */
export const Type = {
  display: { fontFamily: Font.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.28 },
  title: { fontFamily: Font.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.11 },
  heading: { fontFamily: Font.semibold, fontSize: 18, lineHeight: 24 },
  subheading: { fontFamily: Font.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: Font.regular, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: Font.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: Font.regular, fontSize: 13, lineHeight: 18 },
  micro: { fontFamily: Font.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.06 },
} as const;
export type TypeName = keyof typeof Type;

/** HealthHub/Spacing */
export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, screen: 20 } as const;

/** HealthHub/Radius */
export const Radius = { sm: 8, button: 12, card: 16, sheet: 24, pill: 999 } as const;

/** Minimum touch target */
export const HitSize = 44;

/** Floating tab bar: 72 tall, floats 12px above the safe area. Screens pad their content above it. */
export const TabBarHeight = 72;
export const TabBarGap = 12;
/** Extra bottom padding a tab screen needs so its last item clears the tab bar (add insets.bottom). */
export const BottomTabInset = TabBarHeight + TabBarGap + 24;

export const Shadow = {
  card: '0 2px 8px rgba(27, 35, 51, 0.08)',
  float: '0 8px 24px rgba(27, 35, 51, 0.14)',
} as const;
