import { Image } from 'expo-image';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { C, HitSize, Radius, Space, Type } from '@/constants/healthhub';
import { inr, type LabPackage, type Member } from '@/data/types';
import type { ComingUpItem } from '@/hooks/coming-up';

import { Avatar } from './avatar';
import { Button } from './button';
import { Card, StatusPill, Tag } from './controls';
import { Icon, type IconName } from './icon';

// ---------- MemberSwitcher ----------
/** Figma "MemberSwitcher": avatars + first names, selected = navy ring and navy name, "+ Add" last. */
export function MemberSwitcher({
  members,
  selectedId,
  onSelect,
  onAdd,
}: {
  members: Member[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd?: () => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcher} accessibilityRole="tablist">
      {members.map((m) => {
        const on = m.id === selectedId;
        const first = m.name.split(' ')[0];
        return (
          <Pressable
            key={m.id}
            onPress={() => onSelect(m.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Show ${first}'s health`}
            style={styles.member}>
            <View style={[styles.ring, on && styles.ringOn]}>
              <Avatar name={m.name} tone={m.tone} photo={m.photo} />
            </View>
            <Text style={[Type.micro, { color: on ? C.primary : C.textSecondary }]} numberOfLines={1}>
              {first}
            </Text>
          </Pressable>
        );
      })}
      <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel="Add a family member" style={styles.member}>
        <View style={styles.ring}>
          <View style={styles.addCircle}>
            <Icon name="Plus" size={22} color={C.textSecondary} />
          </View>
        </View>
        <Text style={[Type.micro, { color: C.textSecondary }]}>Add</Text>
      </Pressable>
    </ScrollView>
  );
}

// ---------- SearchBar (opens the search screen) ----------
export function SearchBar({ placeholder, onPress }: { placeholder: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="search" accessibilityLabel={placeholder} style={({ pressed }) => [styles.search, pressed && { opacity: 0.85 }]}>
      <Icon name="Search" size={22} color={C.textSecondary} />
      <Text style={[Type.body, { color: C.textSecondary, flex: 1 }]} numberOfLines={1}>
        {placeholder}
      </Text>
    </Pressable>
  );
}

// ---------- QuickAction ----------
/** Figma "QuickAction": 80×72 tile with 3D art (or an icon in a soft circle) and a 12px label. */
export function QuickAction({ label, icon, art, onPress }: { label: string; icon: IconName; art?: number | null; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.qa, pressed && { opacity: 0.8 }]}>
      <View style={styles.qaTile}>
        {art ? (
          <Image source={art} style={{ width: 60, height: 60 }} contentFit="contain" />
        ) : (
          <View style={styles.qaCircle}>
            <Icon name={icon} size={24} color={C.primary} />
          </View>
        )}
      </View>
      <Text style={[Type.micro, styles.center, { color: C.text }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------- ComingUpCard ----------
const KIND: Record<ComingUpItem['kind'], { icon: IconName; bg: string; fg: string }> = {
  appointment: { icon: 'Stethoscope', bg: C.primarySoft, fg: C.primary },
  lab: { icon: 'Flask', bg: C.tealSoft, fg: C.tealText },
  medicine: { icon: 'Pill', bg: C.tealSoft, fg: C.tealText },
  vaccine: { icon: 'Syringe', bg: C.warningSoft, fg: C.warningText },
};

/** Figma "ComingUpCard": icon, status pill above the title, member + when, one secondary action. */
export function ComingUpCard({ item, member, hero, onPress, onAction }: {
  item: ComingUpItem; member?: Member; onPress?: () => void; onAction?: () => void;
  /** the next thing coming up: a navy card with a lime "when" chip, the one focal point on Home */
  hero?: boolean;
}) {
  const k = KIND[item.kind];
  const first = member?.name.split(' ')[0] ?? '';
  if (hero) {
    return (
      <Pressable
        onPress={onPress}
        // no role on web: RN-web would render a <button> and the Button inside it would nest (same as Card)
        accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
        accessibilityLabel={`Next up:${item.title}, ${item.when}${first ? ', for ' + first : ''}`}
        style={({ pressed }) => [styles.hero, pressed && { opacity: 0.92 }]}>
        <View style={styles.cuHead}>
          <View style={[styles.cuIcon, { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
            <Icon name={k.icon} size={22} color={C.textInverse} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[Type.micro, { color: 'rgba(255,255,255,0.75)' }]}>{item.pill.label}</Text>
            <Text style={[Type.subheading, { color: C.textInverse }]} numberOfLines={2}>{item.title}</Text>
            {item.subtitle ? (
              <Text style={[Type.caption, { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={2}>{item.subtitle}</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.heroWhen}>
          <Icon name="Clock" size={16} color={C.primary} />
          <Text style={[Type.bodyMedium, { color: C.primary, flexShrink: 1 }]} numberOfLines={1}>
            {first ? `${first} · ` : ''}{item.when}
          </Text>
        </View>
        <View style={styles.heroAction}>
          <Button label={item.action.label} icon={item.action.icon} variant="secondary" size="M" fill onPress={onAction} />
        </View>
      </Pressable>
    );
  }
  return (
    <Card onPress={onPress} accessibilityLabel={`${item.title}, ${item.when}${first ? ', for ' + first : ''}`}>
      <View style={{ gap: Space.lg }}>
        <View style={styles.cuHead}>
          <View style={[styles.cuIcon, { backgroundColor: k.bg }]}>
            <Icon name={k.icon} size={22} color={k.fg} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <StatusPill status={item.pill.status} label={item.pill.label} />
            <Text style={[Type.subheading, { color: C.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            {item.subtitle ? (
              <Text style={[Type.caption, { color: C.textSecondary }]} numberOfLines={2}>
                {item.subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.cuInfo}>
          {member ? <Avatar name={member.name} tone={member.tone} size="S" /> : null}
          {member ? <Text style={[Type.bodyMedium, { color: C.text }]}>{first}</Text> : null}
          {member ? <Text style={[Type.bodyMedium, { color: C.textSecondary }]}>·</Text> : null}
          <Icon name="Clock" size={16} color={C.textSecondary} />
          <Text style={[Type.bodyMedium, { color: C.text, flexShrink: 1 }]} numberOfLines={1}>
            {item.when}
          </Text>
        </View>
        <Button label={item.action.label} icon={item.action.icon} variant="secondary" size="M" onPress={onAction} />
      </View>
    </Card>
  );
}

// ---------- RecordCard ----------
export const RECORD_KIND: Record<string, { icon: IconName; bg: string; fg: string; label: string }> = {
  prescription: { icon: 'Prescription', bg: C.primarySoft, fg: C.primary, label: 'Prescription' },
  lab_report: { icon: 'Flask', bg: C.tealSoft, fg: C.tealText, label: 'Lab report' },
  scan: { icon: 'Scan', bg: C.warningSoft, fg: C.warningText, label: 'Scan' },
  vaccine: { icon: 'Syringe', bg: C.tealSoft, fg: C.tealText, label: 'Vaccine' },
  discharge: { icon: 'Hospital', bg: C.primarySoft, fg: C.primary, label: 'Discharge' },
  other: { icon: 'Document', bg: C.primarySoft, fg: C.primary, label: 'Other' },
};

/** Figma "RecordCard": type tile, title, provider, member · date, attachment count, chevron. */
export function RecordCard({
  type, title, provider, meta, files, onPress,
}: {
  type: string; title: string; provider: string; meta: string; files: number; onPress?: () => void;
}) {
  const k = RECORD_KIND[type] ?? RECORD_KIND.other;
  return (
    <Card onPress={onPress} accessibilityLabel={`${k.label}: ${title}, ${provider}, ${meta}, ${files} file${files === 1 ? '' : 's'}`}>
      <View style={styles.recRow}>
        <View style={[styles.recTile, { backgroundColor: k.bg }]}>
          <Icon name={k.icon} color={k.fg} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[Type.micro, { color: k.fg }]}>{k.label}</Text>
          <Text style={[Type.subheading, { color: C.text }]} numberOfLines={2}>{title}</Text>
          <Text style={[Type.caption, { color: C.textSecondary }]} numberOfLines={1}>{provider}</Text>
          <View style={styles.recMeta}>
            <Text style={[Type.caption, { color: C.textSecondary }]}>{meta}</Text>
            {/* a "0" next to a paperclip reads like an error, so only show it when there are files */}
            {files > 0 ? (
              <View style={styles.recFiles}>
                <Icon name="Paperclip" size={14} color={C.textSecondary} />
                <Text style={[Type.micro, { color: C.textSecondary }]}>{files}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Icon name="Chevron Right" size={20} color={C.textSecondary} />
      </View>
    </Card>
  );
}

// ---------- LabPackageCard ----------
/** Figma "LabPackageCard": 264 wide, home-collection + NABL tags, tests, report time, ₹ price, MRP struck through. */
export function LabPackageCard({ pkg, onPress, onBook, width = 264 }: { pkg: LabPackage; onPress?: () => void; onBook?: () => void; width?: number | '100%' }) {
  const off = Math.round((1 - pkg.priceInr / pkg.mrpInr) * 100);
  return (
    <Card onPress={onPress} style={{ width }} accessibilityLabel={`${pkg.name}, ${pkg.testsCount} tests, ${inr(pkg.priceInr)}, was ${inr(pkg.mrpInr)}`}>
      <View style={{ gap: Space.md }}>
        <View style={styles.tags}>
          {pkg.homeCollection ? <Tag label="Home collection" icon="Home" tone="teal" /> : null}
          <Tag label="NABL lab" icon="Shield Tick" />
        </View>
        <Text style={[Type.heading, { color: C.text }]} numberOfLines={2}>{pkg.name}</Text>
        <View style={{ gap: 4 }}>
          <View style={styles.detail}>
            <Icon name="Flask" size={16} color={C.textSecondary} />
            <Text style={[Type.caption, { color: C.textSecondary }]}>{pkg.testsCount === 1 ? '1 test' : `${pkg.testsCount} tests included`}{pkg.testsNote ? ` ${pkg.testsNote}` : ''}</Text>
          </View>
          <View style={styles.detail}>
            <Icon name="Clock" size={16} color={C.textSecondary} />
            <Text style={[Type.caption, { color: C.textSecondary }]}>Report in {pkg.reportHours} h</Text>
          </View>
        </View>
        <View style={styles.hr} />
        <View style={styles.priceRow}>
          <View style={{ gap: 2 }}>
            <Text style={[Type.heading, { color: C.text }]}>{inr(pkg.priceInr)}</Text>
            <View style={styles.detail}>
              <Text style={[Type.caption, { color: C.textSecondary, textDecorationLine: 'line-through' }]}>{inr(pkg.mrpInr)}</Text>
              <Text style={[Type.micro, { color: C.tealText }]}>{off}% off</Text>
            </View>
          </View>
          <Button label="Book" size="M" onPress={onBook ?? onPress} accessibilityLabel={`Book ${pkg.name}`} />
        </View>
      </View>
    </Card>
  );
}

// ---------- PromoCarousel ----------
export type Promo = { id: string; title: string; message: string; link: string; art?: number | null; tone: 'teal' | 'navy' };

/** One small paging carousel (replaces the two full-width banners), with page dots. */
export function PromoCarousel({ promos, width, onPress }: { promos: Promo[]; width: number; onPress?: (p: Promo) => void }) {
  const [page, setPage] = useState(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (width + Space.md));
    if (i !== page) setPage(i);
  };
  return (
    <View style={{ gap: Space.md }}>
      <ScrollView
        horizontal
        pagingEnabled={false}
        snapToInterval={width + Space.md}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        contentContainerStyle={{ gap: Space.md }}>
        {promos.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => onPress?.(p)}
            accessibilityRole="button"
            accessibilityLabel={`${p.title}. ${p.message} ${p.link}`}
            style={[styles.promo, { width, backgroundColor: p.tone === 'teal' ? C.tealSoft : C.primarySoft }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[Type.subheading, { color: C.text }]}>{p.title}</Text>
              <Text style={[Type.caption, { color: C.textSecondary }]} numberOfLines={2}>{p.message}</Text>
              <Text style={[Type.bodyMedium, { color: p.tone === 'teal' ? C.tealText : C.primary }]}>{p.link}</Text>
            </View>
            {p.art ? <Image source={p.art} style={{ width: 72, height: 72 }} contentFit="contain" /> : null}
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {promos.map((p, i) => (
          <View key={p.id} style={[styles.dot, i === page && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  switcher: { gap: Space.sm },
  member: { width: 60, alignItems: 'center', gap: 4 },
  ring: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  ringOn: { borderColor: C.primary },
  addCircle: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: C.borderStrong, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  search: {
    height: 52, borderRadius: Radius.pill, backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingHorizontal: Space.lg,
  },
  qa: { flex: 1, maxWidth: 88, alignItems: 'center', gap: Space.sm, minHeight: HitSize },
  qaTile: {
    width: '100%', height: 72, borderRadius: Radius.card, backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  qaCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  cuHead: { flexDirection: 'row', gap: Space.md, alignItems: 'flex-start' },
  cuIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cuInfo: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  hero: { backgroundColor: C.primary, borderRadius: Radius.card, padding: Space.lg, gap: Space.lg },
  heroWhen: {
    flexDirection: 'row', alignItems: 'center', gap: Space.sm, alignSelf: 'flex-start',
    backgroundColor: C.highlight, borderRadius: Radius.pill, paddingHorizontal: Space.md, paddingVertical: Space.sm,
  },
  heroAction: { flexDirection: 'row' },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  recTile: { width: 48, height: 48, borderRadius: Radius.button, alignItems: 'center', justifyContent: 'center' },
  recMeta: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  recFiles: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  detail: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  hr: { height: StyleSheet.hairlineWidth, backgroundColor: C.border },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  promo: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.lg, borderRadius: Radius.card },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.borderStrong },
  dotOn: { width: 20, backgroundColor: C.primary },
});
