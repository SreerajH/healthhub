import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutRectangle, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, Radius, Shadow, Space, Type } from '@/constants/healthhub';

import { Button } from './button';

const SEEN_KEY = 'healthhub.coachmarks.v1';
const CARD_SPACE = 230; // room the tip card needs below a spot

export type CoachStep = { id: string; title: string; body: string };
type Measure = () => Promise<LayoutRectangle | null>;

type Ctx = {
  /** a screen registers each thing a tip can point at, and how to measure it now */
  register: (id: string, measure: Measure | null) => void;
  /** a scrolling screen registers how to shift its content, so a spot below the fold can be shown */
  setScroller: (scrollBy: ((dy: number) => void) | null) => void;
  start: (steps: CoachStep[]) => void;
  /** show the tour on first run, unless it's been seen */
  maybeStart: (steps: CoachStep[]) => void;
  active: boolean;
};
const CoachContext = createContext<Ctx>({
  register: () => {}, setScroller: () => {}, start: () => {}, maybeStart: () => {}, active: false,
});
export const useCoachMarks = () => useContext(CoachContext);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * First-run tips: a dimmed screen with a hole over the thing being explained and a card beside it.
 * Shown once, then replayable from Profile.
 *
 * Two things keep the spotlight honest: each spot is measured when its tip opens (not at layout time,
 * which goes stale as soon as the screen scrolls), and the modal is NOT statusBarTranslucent — so its
 * coordinate space matches what measureInWindow reports on Android.
 * No entering animations either: a backgrounded tab freezes them, leaving the overlay invisible but blocking.
 */
export function CoachMarksProvider({ children }: { children: ReactNode }) {
  const [steps, setSteps] = useState<CoachStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<LayoutRectangle | null>(null);
  const targets = useRef<Record<string, Measure>>({});
  const scroller = useRef<((dy: number) => void) | null>(null);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const register = useCallback((id: string, measure: Measure | null) => {
    if (measure) targets.current[id] = measure;
    else delete targets.current[id];
  }, []);
  const setScroller = useCallback((fn: ((dy: number) => void) | null) => { scroller.current = fn; }, []);

  const start = useCallback((s: CoachStep[]) => { setRect(null); setIndex(0); setSteps(s); }, []);

  const maybeStart = useCallback((s: CoachStep[]) => {
    AsyncStorage.getItem(SEEN_KEY)
      .then((seen) => { if (!seen) setTimeout(() => start(s), 900); })
      .catch(() => {});
  }, [start]);

  const finish = useCallback(() => {
    setSteps(null);
    setRect(null);
    AsyncStorage.setItem(SEEN_KEY, 'seen').catch(() => {});
  }, []);

  const step = steps?.[index];
  const stepId = step?.id;

  // measure the spot for this tip, scrolling it into view first if it's off-screen
  useEffect(() => {
    if (!stepId) return;
    let cancelled = false;
    (async () => {
      const measure = targets.current[stepId];
      if (!measure) { setRect(null); return; }
      let r = await measure();
      const top = insets.top + Space.sm;
      const bottom = height - insets.bottom - CARD_SPACE;
      if (r && scroller.current && (r.y < top || r.y + r.height > bottom)) {
        scroller.current(r.y - (top + Space.xxl));
        await wait(420);
        if (cancelled) return;
        r = await measure();
      }
      if (!cancelled) setRect(r);
    })();
    return () => { cancelled = true; };
  }, [stepId, height, insets.top, insets.bottom]);

  const value = useMemo(() => ({ register, setScroller, start, maybeStart, active: !!steps }), [register, setScroller, start, maybeStart, steps]);

  // place the card below the spot, or above it when there's no room
  const pad = 8;
  const hole = rect
    ? { left: Math.max(Space.sm, rect.x - pad), top: rect.y - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null;
  const below = hole ? hole.top + hole.height + Space.md : height / 2;
  const cardBelow = !hole || below + CARD_SPACE < height - insets.bottom;

  return (
    <CoachContext.Provider value={value}>
      {children}
      <Modal visible={!!steps} transparent animationType="fade" onRequestClose={finish}>
        <View style={styles.root}>
          {/* four panels around the spot, so the thing being explained stays bright */}
          {hole ? (
            <>
              <View style={[styles.dim, { top: 0, left: 0, right: 0, height: Math.max(0, hole.top) }]} />
              <View style={[styles.dim, { top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }]} />
              <View style={[styles.dim, { top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height }]} />
              <View style={[styles.dim, { top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }]} />
              <View pointerEvents="none" style={[styles.ring, hole]} />
            </>
          ) : (
            <View style={[styles.dim, StyleSheet.absoluteFill]} />
          )}

          {step ? (
            <View
              key={step.id}
              style={[
                styles.card,
                { width: Math.min(width - Space.screen * 2, 420) },
                cardBelow ? { top: below } : { bottom: height - (hole?.top ?? height / 2) + Space.md },
              ]}>
              <Text style={[Type.micro, { color: C.textSecondary }]}>Tip {index + 1} of {steps!.length}</Text>
              <Text style={[Type.heading, { color: C.text }]} accessibilityRole="header">{step.title}</Text>
              <Text style={[Type.body, { color: C.textSecondary }]}>{step.body}</Text>
              <View style={styles.actions}>
                <Pressable onPress={finish} accessibilityRole="button" style={styles.skip}>
                  <Text style={[Type.bodyMedium, { color: C.textSecondary }]}>Skip</Text>
                </Pressable>
                <Button
                  label={index === steps!.length - 1 ? 'Got it' : 'Next'}
                  size="M"
                  onPress={() => (index === steps!.length - 1 ? finish() : setIndex((i) => i + 1))}
                />
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </CoachContext.Provider>
  );
}

/** Wrap the thing a tip points at. */
export function CoachTarget({ id, children, style }: { id: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { register } = useCoachMarks();
  const ref = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => {
    register(id, () => new Promise<LayoutRectangle | null>((resolve) => {
      const node = ref.current;
      if (!node) return resolve(null);
      // measured against the window, which is the modal's own coordinate space
      node.measureInWindow((x, y, w, h) => resolve(w || h ? { x, y, width: w, height: h } : null));
      // a view that never reports back shouldn't hold up the tip
      setTimeout(() => resolve(null), 400);
    }));
    return () => register(id, null);
  }, [id, register]);

  return <View ref={ref} style={style} collapsable={false}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  dim: { position: 'absolute', backgroundColor: 'rgba(11, 15, 24, 0.72)' },
  ring: { position: 'absolute', borderRadius: Radius.card, borderWidth: 2, borderColor: C.card },
  card: {
    position: 'absolute', alignSelf: 'center', backgroundColor: C.card, borderRadius: Radius.card,
    padding: Space.xl, gap: Space.sm, boxShadow: Shadow.float,
  },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Space.sm },
  skip: { minHeight: 44, paddingHorizontal: Space.sm, justifyContent: 'center' },
});

export const HOME_COACH_STEPS: CoachStep[] = [
  { id: 'members', title: 'Switch between your family', body: 'Tap a face to see that person\'s appointments, records and reminders. Add anyone you care for.' },
  { id: 'search', title: 'Search everything at once', body: 'Doctors, lab tests and your own records — all from this one box.' },
  { id: 'actions', title: 'The things you do often', body: 'Book a doctor, order a lab test, upload a prescription or set a medicine reminder.' },
  { id: 'comingup', title: 'What\'s coming up', body: 'The next visit, due vaccine or medicine dose, with a reminder before each one.' },
  { id: 'tabs', title: 'Find your way around', body: 'Records keeps every report, Bookings holds your visits, and Profile has your family and settings.' },
];
