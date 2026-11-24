import { useEffect, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { C, Radius, Space, Type } from '@/constants/healthhub';
import { inr, type Doctor } from '@/data/types';

import { Avatar } from './avatar';
import { Button } from './button';
import { Card, StatusPill } from './controls';
import { Icon, type IconName } from './icon';

// ---------- ChipRow ----------
/** Horizontal, edge-to-edge row of filter chips. */
export function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={label}
      style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
      {children}
    </ScrollView>
  );
}

// ---------- Rating ----------
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessible accessibilityLabel={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name="Star Filled" size={size} color={i <= Math.round(value) ? C.warning : C.border} />
      ))}
    </View>
  );
}

// ---------- DoctorCard ----------
/** Figma "DoctorCard": avatar, name + Verified, specialty, experience · languages, rating; fee, next slot, Book. */
export function DoctorCard({ doctor: d, next, onPress, onBook }: { doctor: Doctor; next: string | null; onPress: () => void; onBook: () => void }) {
  return (
    <Card onPress={onPress} accessibilityLabel={`${d.name}, ${d.specialty}, ${d.experienceYears} years experience, rated ${d.rating}, fee ${inr(d.feeInr)}${next ? `, next available ${next}` : ''}`}>
      <View style={{ gap: Space.md }}>
        <View style={styles.docTop}>
          <Avatar initials={d.initials} tone={d.tone} size="L" />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.docNameRow}>
              <Text style={[Type.subheading, { color: C.text, flex: 1 }]} numberOfLines={1}>{d.name}</Text>
              {d.verified ? <StatusPill status="verified" /> : null}
            </View>
            <Text style={[Type.caption, { color: C.textSecondary }]}>{d.specialty}</Text>
            <Text style={[Type.caption, { color: C.textSecondary }]} numberOfLines={1}>
              {d.experienceYears} yrs exp · {d.languages.slice(0, 3).join(', ')}
            </Text>
            <View style={styles.rating}>
              <Icon name="Star Filled" size={14} color={C.warning} />
              <Text style={[Type.bodyMedium, { color: C.text }]}>{d.rating}</Text>
              <Text style={[Type.caption, { color: C.textSecondary }]}>({d.reviewCount} reviews)</Text>
            </View>
          </View>
        </View>
        <View style={styles.hr} />
        <View style={styles.docBottom}>
          <View>
            <Text style={[Type.heading, { color: C.text }]}>{inr(d.feeInr)}</Text>
            <Text style={[Type.micro, { color: C.textSecondary }]}>Consultation fee</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[Type.micro, { color: C.textSecondary }]}>Next available</Text>
            <Text style={[Type.bodyMedium, { color: next ? C.tealText : C.textSecondary }]} numberOfLines={1}>{next ?? 'No slots this week'}</Text>
          </View>
          <Button label="Book" size="M" onPress={onBook} disabled={!next} accessibilityLabel={`Book ${d.name}`} />
        </View>
      </View>
    </Card>
  );
}

// ---------- Segmented ----------
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.seg} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={[styles.segItem, on && styles.segOn]}>
            <Text style={[Type.bodyMedium, { color: on ? C.primary : C.textSecondary }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- SlotPicker ----------
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dparts = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }; };

/** Figma "SlotPicker" day strip: 7 equal boxes; closed days greyed. */
export function DayStrip({ days, value, onChange }: { days: { date: string; available: boolean }[]; value: string | null; onChange: (d: string) => void }) {
  const first = dparts(days[0].date);
  const last = dparts(days[days.length - 1].date);
  const month = first.m === last.m ? `${MONTH[first.m - 1]} ${first.y}` : `${MONTH[first.m - 1].slice(0, 3)} – ${MONTH[last.m - 1].slice(0, 3)} ${last.y}`;
  return (
    <View style={{ gap: Space.md }}>
      <Text style={[Type.subheading, { color: C.text }]}>{month}</Text>
      <View style={styles.days} accessibilityRole="radiogroup" accessibilityLabel="Day">
        {days.map((d) => {
          const p = dparts(d.date);
          const on = d.date === value;
          return (
            <Pressable key={d.date} onPress={() => onChange(d.date)} disabled={!d.available}
              accessibilityRole="radio" accessibilityState={{ checked: on, disabled: !d.available }}
              accessibilityLabel={`${DOW[p.dow]} ${p.d} ${MONTH[p.m - 1]}${d.available ? '' : ', no slots'}`}
              style={[styles.day, on && styles.dayOn, !d.available && styles.slotOff]}>
              <Text style={[Type.micro, { color: on ? C.textInverse : d.available ? C.textSecondary : C.borderStrong }]}>{DOW[p.dow]}</Text>
              <Text style={[Type.subheading, { color: on ? C.textInverse : d.available ? C.text : C.borderStrong }]}>{p.d}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Figma "SlotPicker" time chips in 3 columns, grouped by session; taken slots greyed. */
export function SlotGrid({
  groups, value, onChange, emptyText = 'No slots on this day. Try another day.',
}: {
  groups: { label: string; slots: { time: string; at: string; available: boolean }[] }[];
  value: string | null;
  onChange: (at: string) => void;
  emptyText?: string;
}) {
  if (!groups.length || groups.every((g) => !g.slots.some((s) => s.available))) {
    return (
      <View style={styles.noSlots}>
        <Icon name="Calendar" size={22} color={C.textSecondary} />
        <Text style={[Type.body, { color: C.textSecondary, flex: 1 }]}>{emptyText}</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: Space.lg }}>
      {groups.map((g) => (
        <View key={g.label} style={{ gap: Space.sm }} accessibilityRole="radiogroup" accessibilityLabel={g.label}>
          <Text style={[Type.body, { color: C.textSecondary }]}>{g.label}</Text>
          {chunk(g.slots, 3).map((row, i) => (
            <View key={i} style={styles.slotRow}>
              {row.map((s) => {
                const on = s.at === value;
                const label = clock(s.time);
                return (
                  <Pressable key={s.at} onPress={() => onChange(s.at)} disabled={!s.available}
                    accessibilityRole="radio" accessibilityState={{ checked: on, disabled: !s.available }}
                    accessibilityLabel={s.available ? label : `${label}, booked`}
                    style={[styles.slot, on && styles.dayOn, !s.available && styles.slotOff]}>
                    <Text style={[Type.bodyMedium, { color: on ? C.textInverse : s.available ? C.text : C.borderStrong }]}>{label}</Text>
                  </Pressable>
                );
              })}
              {Array.from({ length: 3 - row.length }, (_, k) => <View key={`pad${k}`} style={{ flex: 1 }} />)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
const clock = (hm: string) => { const [h, m] = hm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// ---------- SelectCard ----------
/** Radio or checkbox card (payment method, address, family member). */
export function SelectCard({
  selected, onPress, control, title, subtitle, icon, leading, disabled,
}: {
  selected: boolean; onPress: () => void; control: 'radio' | 'check'; title: string; subtitle?: string;
  icon?: IconName; leading?: ReactNode; disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled}
      accessibilityRole={control === 'radio' ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={({ pressed }) => [styles.select, selected && styles.selectOn, disabled && { opacity: 0.55 }, pressed && !disabled && { backgroundColor: C.background }]}>
      {leading ?? (icon ? (
        <View style={styles.selectIcon}><Icon name={icon} size={22} color={C.primary} /></View>
      ) : null)}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[Type.bodyMedium, { color: C.text }]}>{title}</Text>
        {subtitle ? <Text style={[Type.caption, { color: C.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {control === 'radio' ? (
        <View style={[styles.radio, selected && { borderColor: C.primary }]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      ) : (
        <View style={[styles.box, selected && styles.boxOn]}>{selected ? <Icon name="Tick" size={16} color={C.textInverse} /> : null}</View>
      )}
    </Pressable>
  );
}

// ---------- Sticky footer ----------
/** Bottom bar above the safe area: optional summary + amount, then the main button(s). */
export function StickyFooter({ summary, amount, children }: { summary?: string; amount?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: insets.bottom + Space.md }]}>
      <View style={styles.footerInner}>
        {summary || amount ? (
          <View style={styles.footerSummary} accessibilityLiveRegion="polite">
            <Text style={[Type.body, { color: C.textSecondary, flex: 1 }]} numberOfLines={1}>{summary}</Text>
            {amount ? <Text style={[Type.heading, { color: C.text }]}>{amount}</Text> : null}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: Space.md }}>{children}</View>
      </View>
    </View>
  );
}

// ---------- Notes, details, stats ----------
const NOTE = {
  teal: [C.tealSoft, C.tealText], navy: [C.primarySoft, C.primary], amber: [C.warningSoft, C.warningText],
} as const;
export function InfoNote({ tone = 'teal', icon = 'Info', children }: { tone?: keyof typeof NOTE; icon?: IconName; children: ReactNode }) {
  const [bg, fg] = NOTE[tone];
  return (
    <View style={[styles.note, { backgroundColor: bg }]}>
      <Icon name={icon} size={20} color={fg} />
      <Text style={[Type.body, { color: fg, flex: 1 }]}>{children}</Text>
    </View>
  );
}

/** White card of label/value rows ("Patient · Kabir Mehta"); `header` sits above the first row. */
export function DetailsCard({ header, rows, emphasizeLast }: { header?: ReactNode; rows: [string, string][]; emphasizeLast?: boolean }) {
  return (
    <View style={styles.details}>
      {header ? <View style={[styles.detailRow, { borderTopWidth: 0, paddingTop: 0 }]}>{header}</View> : null}
      {rows.map(([k, v], i) => {
        const big = emphasizeLast && i === rows.length - 1;
        return (
          <View key={k} style={[styles.detailRow, !header && i === 0 && { borderTopWidth: 0, paddingTop: 0 }]}>
            <Text style={[Type.body, { color: C.textSecondary }]}>{k}</Text>
            <Text style={[big ? Type.heading : Type.bodyMedium, { color: C.text, flex: 1, textAlign: 'right' }]}>{v}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function StatTiles({ items }: { items: [string, string][] }) {
  return (
    <View style={styles.stats}>
      {items.map(([k, v]) => (
        <View key={k} style={styles.stat} accessible accessibilityLabel={`${k}: ${v}`}>
          <Text style={[Type.micro, { color: C.textSecondary }]}>{k}</Text>
          <Text style={[Type.subheading, { color: C.text }]} numberOfLines={1}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

/** Decorative map tile with a pin (a real map comes with Part C / react-native-maps). */
export function MapPreview() {
  return (
    <View style={styles.map} accessible={false} importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((r) => (
        <View key={r} style={styles.mapRow}>
          {[0, 1, 2].map((c) => <View key={c} style={[styles.mapBlock, { flex: c === 1 ? 1.1 : 1 }]} />)}
        </View>
      ))}
      <View style={styles.pin}><Icon name="Location" size={18} color={C.textInverse} /></View>
    </View>
  );
}

// ---------- Success mark ----------
const APath = Animated.createAnimatedComponent(Path);
const CHECK_LEN = 40;

/**
 * Booking confirmed: the circle springs in, the tick draws itself, one soft ring pulse.
 * With reduced motion it simply appears.
 */
export function SuccessMark({ onDone }: { onDone?: () => void }) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(reduce ? 1 : 0.4);
  const fade = useSharedValue(reduce ? 1 : 0);
  const draw = useSharedValue(reduce ? 0 : CHECK_LEN);
  const ring = useSharedValue(0);

  useEffect(() => {
    if (reduce) { onDone?.(); return; }
    fade.value = withTiming(1, { duration: 180 });
    scale.value = withSpring(1, { damping: 11, stiffness: 160 });
    draw.value = withDelay(260, withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) }));
    ring.value = withDelay(520, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
    const t = setTimeout(() => onDone?.(), 560);
    return () => clearTimeout(t);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const circle = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ scale: scale.value }] }));
  const pulse = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - ring.value), transform: [{ scale: 1 + ring.value * 0.45 }] }));
  const tick = useAnimatedProps(() => ({ strokeDashoffset: draw.value }));

  return (
    <View style={styles.successWrap} accessible accessibilityRole="image" accessibilityLabel="Success">
      <View style={styles.successHalo} />
      {reduce ? null : <Animated.View style={[styles.successRing, pulse]} />}
      <Animated.View style={[styles.successCircle, circle]}>
        <Svg width={56} height={56} viewBox="0 0 56 56">
          <APath d="M16 29 L24.5 37.5 L40 20" stroke={C.textInverse} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"
            fill="none" strokeDasharray={CHECK_LEN} animatedProps={tick} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  chipScroll: { marginHorizontal: -Space.screen, flexGrow: 0 },
  chipRow: { paddingHorizontal: Space.screen, gap: Space.sm },
  docTop: { flexDirection: 'row', gap: Space.md },
  docNameRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  hr: { height: StyleSheet.hairlineWidth, backgroundColor: C.border },
  docBottom: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  seg: { flexDirection: 'row', backgroundColor: C.primarySoft, borderRadius: Radius.button, padding: 4 },
  segItem: { flex: 1, minHeight: 40, borderRadius: Radius.sm + 2, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.card, boxShadow: '0 1px 3px rgba(27, 35, 51, 0.12)' },
  days: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1, height: 64, borderRadius: Radius.button, borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  dayOn: { backgroundColor: C.primary, borderColor: C.primary },
  slotOff: { backgroundColor: C.background, borderColor: C.border },
  slotRow: { flexDirection: 'row', gap: Space.sm },
  slot: {
    flex: 1, height: 44, borderRadius: Radius.button, borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
  },
  noSlots: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.lg, borderRadius: Radius.card, backgroundColor: C.card },
  select: {
    flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.lg, borderRadius: Radius.card,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  selectOn: { borderColor: C.primary, borderWidth: 2, padding: Space.lg - 1 },
  selectIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.primary },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: C.borderStrong, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.primary, borderColor: C.primary },
  footer: { backgroundColor: C.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, paddingTop: Space.md, paddingHorizontal: Space.screen },
  footerInner: { gap: Space.md, width: '100%', maxWidth: 600, alignSelf: 'center' },
  footerSummary: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  note: { flexDirection: 'row', gap: Space.md, padding: Space.lg, borderRadius: Radius.card, alignItems: 'flex-start' },
  details: { backgroundColor: C.card, borderRadius: Radius.card, padding: Space.lg, borderWidth: 1, borderColor: C.border },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Space.lg,
    paddingVertical: Space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
  },
  stats: { flexDirection: 'row', gap: Space.sm },
  stat: { flex: 1, padding: Space.md, borderRadius: Radius.button, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, gap: 2 },
  map: { height: 120, borderRadius: Radius.button, overflow: 'hidden', gap: 6, backgroundColor: C.card },
  mapRow: { flex: 1, flexDirection: 'row', gap: 6 },
  mapBlock: { backgroundColor: C.primarySoft, borderRadius: 6 },
  pin: {
    position: 'absolute', left: '50%', top: '50%', marginLeft: -16, marginTop: -16, width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
  },
  successWrap: { width: 192, height: 192, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  successHalo: { position: 'absolute', width: 192, height: 192, borderRadius: 96, backgroundColor: C.tealSoft },
  successRing: { position: 'absolute', width: 132, height: 132, borderRadius: 66, borderWidth: 3, borderColor: C.teal },
  successCircle: { width: 132, height: 132, borderRadius: 66, backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center' },
});
