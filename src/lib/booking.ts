// Booking rules and the bits of UI state a flow carries between screens.
// The slots themselves come from the database (src/hooks/catalog.ts); this file groups them
// for the day strip and the time grid, and holds the rules that decide what's allowed.

import { create } from 'zustand';

import type { Slot } from '@/hooks/catalog';
import { ageOf, todayISO, type LabPackage, type Member, type PaymentMethod } from '@/data/types';

import { dayLabel, daysFromToday, timeLabel } from './dates';

// ---------- dates ----------
/** "2026-11-17" + 3 → "2026-11-20" */
export function addDays(iso: string, n: number) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export const weekdayOf = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
/** "Today, 4:30 PM" · "Tomorrow, 10:30 AM" · "Thu, 19 Nov, 11:00 AM" */
export function slotLabel(at: string) {
  const n = daysFromToday(at);
  return `${n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : dayLabel(at)}, ${timeLabel(at)}`;
}
/** "Thu, 19 Nov · 4:30 PM" */
export const whenLabel = (at: string) => `${dayLabel(at)} · ${timeLabel(at)}`;

export const nextDays = (count = 7, from = todayISO()) => Array.from({ length: count }, (_, i) => addDays(from, i));

// ---------- grouping slots for the picker ----------
export type Day = { date: string; available: boolean };
export type SlotGroup = { label: string; slots: { time: string; at: string; available: boolean; id?: string }[] };

const SESSION_OF = (time: string) => (time < '12:00' ? 'Morning' : time < '16:00' ? 'Afternoon' : 'Evening');
const LAB_SESSION_OF = (time: string) => (time < '10:00' ? 'Early morning (best for fasting)' : 'Later morning');

/** The seven days of the strip, marking the ones with at least one free slot. */
export function daysFrom(slots: Slot[], count = 7): Day[] {
  const free = new Set(slots.filter((s) => s.available).map((s) => s.at.slice(0, 10)));
  return nextDays(count).map((date) => ({ date, available: free.has(date) }));
}

/** One day's slots, grouped into the sessions the picker shows. */
export function groupSlots(slots: Slot[], date: string | null, lab = false): SlotGroup[] {
  if (!date) return [];
  const sessionOf = lab ? LAB_SESSION_OF : SESSION_OF;
  const order = lab
    ? ['Early morning (best for fasting)', 'Later morning']
    : ['Morning', 'Afternoon', 'Evening'];
  const groups = new Map<string, SlotGroup['slots']>();
  for (const s of slots) {
    if (!s.at.startsWith(date)) continue;
    const label = sessionOf(s.time);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push({ time: s.time, at: s.at, available: s.available, id: s.id });
  }
  return order
    .filter((label) => groups.has(label))
    .map((label) => ({ label, slots: groups.get(label)!.sort((a, b) => a.time.localeCompare(b.time)) }));
}

/** The soonest free slot, for the "Next available" line on a doctor card. */
export const nextFree = (slots: Slot[]) => slots.find((s) => s.available)?.at ?? null;

/** Home collection runs from tomorrow: today's early slots have already gone. */
export const labDays = (count = 7): Day[] =>
  nextDays(count).map((date, i) => ({ date, available: i > 0 }));

// A phlebotomist's rounds are fixed times rather than booked slots, so they're generated here.
// A stable hash decides which are already taken, so the same day always looks the same.
const LAB_ROUNDS = [
  { label: 'Early morning (best for fasting)', times: ['06:30', '07:00', '07:30', '08:00', '08:30', '09:00'] },
  { label: 'Later morning', times: ['10:00', '10:30', '11:00'] },
];
function taken(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return (h >>> 0) % 4 === 0;
}
export function labSlotsFor(date: string | null): SlotGroup[] {
  if (!date || date === todayISO()) return [];
  return LAB_ROUNDS.map((g) => ({
    label: g.label,
    slots: g.times.map((time) => ({ time, at: `${date}T${time}`, available: !taken(date + time) })),
  }));
}

// ---------- rules ----------
/** Whether a package suits a family member, with a short reason or tip for the member row. */
export function eligibility(p: LabPackage, m: Member): { ok: boolean; note?: string } {
  const age = ageOf(m.dob);
  if (p.minAge !== undefined && age < p.minAge) {
    return { ok: false, note: p.minAge >= 50 ? `this package is for ${p.minAge}+` : 'this package is for adults' };
  }
  if (p.maxAge !== undefined && age > p.maxAge) return { ok: false, note: `this package is for children up to ${p.maxAge}` };
  if (p.category === 'full' && age >= 60) return { ok: true, note: 'try the Senior citizen checkup' };
  return { ok: true };
}

/** Doctor visits can be changed up to 2 hours before; lab collections up to 12. */
export function canChange(at: string, kind: 'doctor' | 'lab') {
  const limit = kind === 'doctor' ? 2 : 12;
  return new Date(at.replace(' ', 'T')).getTime() - Date.now() > limit * 3600 * 1000;
}

export const PAYMENT_LABEL: Record<PaymentMethod, string> = { upi: 'UPI', card: 'card', later: '' };

export type CancelReason = "Can't make it" | 'Booked by mistake' | 'Feeling better' | 'Found another doctor' | 'Other';

// ---------- reviews ----------
export type Review = { name: string; text: string; ago: string; stars: number };
const REVIEWS: Record<string, Review[]> = {
  paeds: [
    { name: 'Neha S.', text: 'Very patient with my 3-year-old. Explained everything clearly and didn\'t over-prescribe.', ago: '2 weeks ago', stars: 5 },
    { name: 'Rahul M.', text: 'On time, gentle and thorough. The clinic is clean and child-friendly.', ago: '1 month ago', stars: 5 },
  ],
  gynae: [
    { name: 'Pooja K.', text: 'Made me feel at ease through my whole pregnancy. Always answers questions properly.', ago: '3 weeks ago', stars: 5 },
    { name: 'Ankita R.', text: 'Clear about the options for my PCOS, with no pressure. Short wait.', ago: '2 months ago', stars: 4 },
  ],
  mental: [
    { name: 'Anonymous', text: 'I never felt rushed. Practical steps for my sleep and anxiety that actually helped.', ago: '1 week ago', stars: 5 },
    { name: 'Anonymous', text: 'Kind and non-judgemental. Follow-ups are easy to book.', ago: '1 month ago', stars: 5 },
  ],
  default: [
    { name: 'Sanjay P.', text: 'Listened carefully and explained the reports in simple words. Worth the visit.', ago: '2 weeks ago', stars: 5 },
    { name: 'Deepa V.', text: 'Punctual and thorough. The staff helped with the follow-up booking too.', ago: '1 month ago', stars: 4 },
  ],
};
export const reviewsFor = (specialtyId: string) => REVIEWS[specialtyId] ?? REVIEWS.default;
export const reviewsTitle = (specialtyId: string) => (specialtyId === 'paeds' ? 'What parents say' : 'What patients say');

// ---------- addresses ----------
// Collection addresses are typed per booking and kept on the device; the booking row stores
// the address text it was made with.
export type Address = { id: string; label: string; line: string; area: string };
type AddressStore = { addresses: Address[]; add: (a: Omit<Address, 'id'>) => string };
export const useAddresses = create<AddressStore>((set, get) => ({
  addresses: [],
  add: (a) => {
    const id = 'addr-' + Date.now().toString(36);
    set({ addresses: [...get().addresses, { ...a, id }] });
    return id;
  },
}));

// ---------- the booking in progress ----------
export type Draft = {
  kind: 'doctor' | 'lab' | null;
  doctorId?: string;
  memberId?: string;
  packageId?: string;
  memberIds: string[];
  addressId?: string;
  at?: string;
  slotId?: string;
  payment: PaymentMethod;
};
type DraftStore = Draft & { update: (d: Partial<Draft>) => void; start: (d: Partial<Draft>) => void };
const EMPTY: Draft = { kind: null, memberIds: [], payment: 'upi' };
export const useDraft = create<DraftStore>((set) => ({
  ...EMPTY,
  update: (d) => set(d),
  start: (d) => set({ ...EMPTY, ...d }),
}));
