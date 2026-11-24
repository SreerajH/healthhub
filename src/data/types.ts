// The shapes the screens work in, plus the small helpers that format them.
// Rows come from Supabase and are mapped into these in src/lib/map.ts, so components never
// deal with snake_case columns or nullable database columns.

import type { AvatarTone } from '@/components/healthhub';

/** Today, from the device clock, as "2026-11-18". */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Now, as a local wall-clock stamp "2026-11-18T14:05" (the format every date helper here expects). */
export function nowISO() {
  const d = new Date();
  return `${todayISO()}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export type Relation = 'self' | 'spouse' | 'child' | 'parent' | 'sibling' | 'other';
export type Member = {
  id: string;
  name: string;
  relation: Relation;
  dob: string;
  gender: 'male' | 'female' | 'other';
  bloodGroup: string;
  heightCm?: number;
  weightKg?: number;
  allergies: string[];
  conditions: string[];
  tone: AvatarTone;
  abha?: string | null;
  /** storage path, or a local image URI while it's being picked */
  photo?: string | null;
};

export type RecordType = 'prescription' | 'lab_report' | 'scan' | 'vaccine' | 'discharge' | 'other';
export type RecordFile = {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  size: number; // bytes
  width?: number;
  height?: number;
};
export type HealthRecord = {
  id: string;
  memberId: string;
  type: RecordType;
  title: string;
  provider: string;
  date: string;
  /** how many files are attached */
  files: number;
  /** the files themselves, once they've been loaded for the details screen */
  attachments?: RecordFile[];
  notes?: string;
};

export type SpecialtyId = 'gp' | 'paeds' | 'gynae' | 'derm' | 'cardio' | 'ortho' | 'ent' | 'dental' | 'eye' | 'neuro' | 'diabetes' | 'mental';
export type Session = 'morning' | 'afternoon' | 'evening';

export type Doctor = {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  specialtyId: SpecialtyId;
  gender: 'female' | 'male';
  qualifications: string;
  college: string;
  experienceYears: number;
  languages: string[];
  feeInr: number;
  rating: number;
  reviewCount: number;
  patients: number;
  clinic: string;
  area: string;
  address: string;
  distanceKm: number;
  regNo: string;
  about: string;
  verified: boolean;
  tone: AvatarTone;
};

export type LabCategory = 'full' | 'diabetes' | 'thyroid' | 'senior' | 'child';
export type TestGroup = { name: string; count: number; tests: string[] };
export type LabPackage = {
  id: string;
  slug: string;
  kind: 'package' | 'test';
  category?: LabCategory;
  name: string;
  testsNote?: string;
  description: string;
  testsCount: number;
  reportHours: number;
  priceInr: number;
  mrpInr: number;
  fastingHours?: string;
  homeCollection: boolean;
  lab: string;
  minAge?: number;
  maxAge?: number;
  groups: TestGroup[];
};

export type AppointmentStatus = 'upcoming' | 'completed' | 'cancelled';
export type PaymentMethod = 'upi' | 'card' | 'later';
export type Appointment = {
  id: string;
  code: string;
  memberId: string;
  doctorId: string;
  slotId?: string | null;
  startsAt: string; // local ISO
  status: AppointmentStatus;
  feeInr: number;
  payment?: PaymentMethod;
};

export type LabBooking = {
  id: string;
  code: string;
  memberIds: string[];
  packageId: string;
  startsAt: string;
  status: AppointmentStatus;
  totalInr: number;
  address: string;
  addressLabel?: string;
  payment?: PaymentMethod;
};

export type Reminder = {
  id: string;
  memberId: string;
  kind: 'medicine' | 'vaccine';
  name: string;
  dose: string;
  times: string[]; // 24h "HH:mm"
  days: number[]; // 0 = Sun … 6 = Sat
  startDate: string;
  endDate?: string | null;
  note?: string;
};

// ---------- helpers ----------
/** Whole years between a date of birth and today. */
export function ageOf(dob: string, today = todayISO()) {
  const [y, m, d] = dob.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

/** ₹ with Indian digit grouping: 129999 → ₹1,29,999 (done by hand: Intl isn't reliable on Hermes). */
export function inr(amount: number) {
  const s = String(Math.round(Math.abs(amount)));
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (amount < 0 ? '-₹' : '₹') + (rest ? rest + ',' + last3 : last3);
}

export const RELATION_LABEL: Record<Relation, string> = {
  self: 'You', spouse: 'Spouse', child: 'Child', parent: 'Parent', sibling: 'Sibling', other: 'Other',
};

export const RECORD_TYPE_LABEL: Record<RecordType, string> = {
  prescription: 'Prescription', lab_report: 'Lab report', scan: 'Scan', vaccine: 'Vaccine', discharge: 'Discharge', other: 'Other',
};

/** newest first */
export const byDateDesc = (a: { date: string }, b: { date: string }) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
