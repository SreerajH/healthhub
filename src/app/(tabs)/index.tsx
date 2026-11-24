import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  Card,
  CoachTarget,
  ComingUpCard,
  IconButton,
  LabPackageCard,
  MemberSwitcher,
  PromoCarousel,
  QuickAction,
  RecordCard,
  SearchBar,
  SectionHeader,
  Skeleton,
  HOME_COACH_STEPS,
  TabScreen,
  TILE_ART,
  useCoachMarks,
  useToast,
  type IconName,
  type Promo,
} from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { byDateDesc } from '@/data/types';
import { doseKey, useComingUp, useLabPackages, useLogDose, useMembers, useRecords } from '@/hooks';
import { useAuth } from '@/lib/auth';
import { useConsents } from '@/lib/consent';
import { useDraft } from '@/lib/booking';
import { dateLabel, greeting } from '@/lib/dates';
import { useSelectedMember } from '@/lib/selected-member';

const QUICK_ACTIONS: { label: string; icon: IconName; art?: keyof typeof TILE_ART }[] = [
  { label: 'Consult', icon: 'Stethoscope', art: 'consult' },
  { label: 'Lab tests', icon: 'Flask', art: 'lab-tests' },
  { label: 'Vaccines', icon: 'Syringe', art: 'vaccines' },
  { label: 'Medicines', icon: 'Pill', art: 'medicines' },
  { label: 'Upload record', icon: 'Upload' },
  { label: 'Reminders', icon: 'Alarm', art: 'reminders' },
  { label: 'Pet care', icon: 'Paw', art: 'pet-care' },
  { label: 'More', icon: 'Grid' },
];

const PROMOS: Promo[] = [
  { id: 'lab', title: 'Lab reports in 24 hours', message: 'Free home sample collection across Bengaluru.', link: 'Book a test', art: TILE_ART['lab-tests'], tone: 'teal' },
  { id: 'abha', title: 'Link your ABHA', message: 'Bring in records from hospitals and labs across India.', link: 'Link now', art: null, tone: 'navy' },
];

/** Figma "HealthHub / Home": what's coming up and what's new, for the selected family member. */
export default function HomeScreen() {
  const toast = useToast();
  const { width } = useWindowDimensions();
  const { memberId, select } = useSelectedMember();
  const { data: members = [] } = useMembers();
  const { data: allRecords = [], isLoading: recordsLoading, refetch: refetchRecords } = useRecords();
  const { data: packages = [] } = useLabPackages();
  const { items: comingUpAll, isLoading: comingUpLoading } = useComingUp(memberId);
  const startDraft = useDraft((s) => s.start);
  const logDose = useLogDose();
  const { maybeStart } = useCoachMarks();
  const accountName = useAuth().profile?.full_name;
  const member = members.find((m) => m.id === memberId);
  const me = members.find((m) => m.relation === 'self') ?? members[0] ?? null;
  const first = member?.name.split(' ')[0] ?? '';
  // ", Aarav" once we know who they are, just "Good morning" until then
  const firstNameOf = (name?: string | null) => (name ? `, ${name.split(' ')[0]}` : '');

  const loading = recordsLoading || comingUpLoading;
  const [refreshing, setRefreshing] = useState(false);
  // only offer the first-run tour while Home is the screen in front
  // (and not while consent or the profile step still sits on top of it)
  const { needsProfile } = useAuth();
  const consented = useConsents().has('account');
  useFocusEffect(useCallback(() => {
    if (consented && !needsProfile) maybeStart(HOME_COACH_STEPS);
  }, [maybeStart, consented, needsProfile]));
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchRecords();
    setRefreshing(false);
  }, [refetchRecords]);

  const comingUp = useMemo(() => comingUpAll.slice(0, 2), [comingUpAll]);
  const recent = useMemo(
    () => allRecords.filter((r) => r.memberId === memberId).sort(byDateDesc).slice(0, 3),
    [allRecords, memberId],
  );
  const soon = (what: string) => toast({ message: `${what} opens in a later build step` });

  /** tapping a "Coming up" card opens the thing it's about */
  const openComingUp = (item: (typeof comingUp)[number]) => {
    if (item.kind === 'appointment' || item.kind === 'lab') router.push({ pathname: '/booking/[id]', params: { id: item.id } });
    else router.push('/reminders');
  };
  /** and its button does the obvious thing: directions, details, or marking a dose taken */
  const actOnComingUp = (item: (typeof comingUp)[number]) => {
    if (item.kind === 'medicine' && item.action.label !== 'Mark as taken') {
      router.push('/reminders');
    } else if (item.kind === 'medicine') {
      logDose.mutate({ key: doseKey(item.id, item.at.slice(0, 10), item.at.slice(11)), state: 'taken' });
      toast({ message: `${item.title} marked as taken` });
    } else if (item.kind === 'vaccine') {
      router.push({ pathname: '/doctors', params: { specialty: 'paeds' } });
    } else {
      router.push({ pathname: '/booking/[id]', params: { id: item.id } });
    }
  };
  const contentWidth = Math.min(width, 600) - Space.screen * 2;

  return (
    <TabScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[Type.title, { color: C.text }]} accessibilityRole="header">
            {greeting()}{firstNameOf(accountName ?? me?.name)}
          </Text>
          <Text style={[Type.body, { color: C.textSecondary }]}>Here&apos;s what&apos;s coming up for your family.</Text>
        </View>
        <IconButton icon="Bell" variant="soft" badge accessibilityLabel="Notifications, 1 unread" onPress={() => router.push('/notifications')} />
      </View>

      <CoachTarget id="members">
        <MemberSwitcher members={members} selectedId={memberId} onSelect={select} onAdd={() => router.push('/family/edit')} />
      </CoachTarget>

      <CoachTarget id="search">
        <SearchBar placeholder="Search doctors, tests, medicines, records" onPress={() => router.push('/search')} />
      </CoachTarget>

      <CoachTarget id="actions" style={{ gap: Space.lg }}>
      <View style={{ gap: Space.lg }} accessibilityLabel="Quick actions">
        {[0, 4].map((start) => (
          <View key={start} style={styles.qaRow}>
            {QUICK_ACTIONS.slice(start, start + 4).map((q) => (
              <QuickAction
                key={q.label}
                label={q.label}
                icon={q.icon}
                art={q.art ? TILE_ART[q.art] : null}
                onPress={() => {
                  if (q.label === 'Upload record') router.push({ pathname: '/record/upload', params: { member: memberId } });
                  else if (q.label === 'Consult') router.push('/specialties');
                  else if (q.label === 'Lab tests') router.push('/labs');
                  else if (q.label === 'Reminders' || q.label === 'Medicines') router.push('/reminders');
                  else if (q.label === 'Vaccines') router.push({ pathname: '/doctors', params: { specialty: 'paeds' } });
                  else soon(q.label);
                }}
              />
            ))}
          </View>
        ))}
      </View>
      </CoachTarget>

      <CoachTarget id="comingup" style={{ gap: Space.md }}>
        <SectionHeader title={`Coming up for ${first}`} actionLabel="See all" onAction={() => router.push('/bookings')} />
        {loading ? (
          <CardSkeleton />
        ) : comingUp.length ? (
          comingUp.map((item, i) => (
            <ComingUpCard key={item.id} item={item} member={member} hero={i === 0}
              onPress={() => openComingUp(item)} onAction={() => actOnComingUp(item)} />
          ))
        ) : (
          <Card onPress={() => router.push('/specialties')} accessibilityLabel="Nothing coming up. Book a check-up">
            <Text style={[Type.body, { color: C.textSecondary }]}>
              Nothing coming up for {first}. <Text style={{ color: C.primary, fontFamily: Type.bodyMedium.fontFamily }}>Book a check-up?</Text>
            </Text>
          </Card>
        )}
      </CoachTarget>

      <View style={{ gap: Space.md }}>
        <SectionHeader title={`${first}'s records`} actionLabel="See all" onAction={() => router.push({ pathname: '/records', params: { member: memberId } })} />
        {loading ? (
          <CardSkeleton short />
        ) : recent.length ? (
          recent.map((r) => (
            <RecordCard key={r.id} type={r.type} title={r.title} provider={r.provider} meta={dateLabel(r.date)} files={r.attachments?.length ?? r.files} onPress={() => router.push({ pathname: '/record/[id]', params: { id: r.id } })} />
          ))
        ) : (
          <Card onPress={() => router.push({ pathname: '/record/upload', params: { member: memberId } })} accessibilityLabel={`No records for ${first} yet. Upload one`}>
            <Text style={[Type.body, { color: C.textSecondary }]}>
              No records for {first} yet. <Text style={{ color: C.primary, fontFamily: Type.bodyMedium.fontFamily }}>Upload one?</Text>
            </Text>
          </Card>
        )}
      </View>

      <View style={{ gap: Space.md }}>
        <SectionHeader title="Popular lab packages" actionLabel="See all" onAction={() => router.push('/labs')} />
        {/* horizontal row that runs to the screen edges */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.bleed}
          contentContainerStyle={{ gap: Space.md, paddingHorizontal: Space.screen }}>
          {packages.filter((p) => p.kind === 'package').slice(0, 3).map((p) => (
            <LabPackageCard key={p.id} pkg={p} onPress={() => router.push({ pathname: '/labs/[id]', params: { id: p.id } })}
              onBook={() => { startDraft({ kind: 'lab', packageId: p.id, memberIds: [memberId] }); router.push({ pathname: '/book/lab/[packageId]', params: { packageId: p.id } }); }} />
          ))}
        </ScrollView>
      </View>

      <PromoCarousel promos={PROMOS} width={contentWidth} onPress={(p) => (p.id === 'lab' ? router.push('/labs') : soon(p.title))} />
    </TabScreen>
  );
}

function CardSkeleton({ short }: { short?: boolean }) {
  return (
    <Card>
      <View style={{ gap: Space.md }} accessibilityLabel="Loading">
        <View style={{ flexDirection: 'row', gap: Space.md }}>
          <Skeleton width={44} height={44} radius={22} />
          <View style={{ flex: 1, gap: Space.sm }}>
            <Skeleton width="70%" height={14} />
            <Skeleton width="90%" height={10} />
          </View>
        </View>
        {short ? null : <Skeleton width="100%" height={40} radius={12} />}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  // a soft lavender wash behind the greeting (the calm of the Elli reference), not the whole screen
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Space.md,
    backgroundColor: C.heroTint, borderRadius: Radius.card, padding: Space.lg,
  },
  qaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Space.md },
  bleed: { marginHorizontal: -Space.screen },
});
