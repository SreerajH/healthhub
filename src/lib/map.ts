// Database rows → the shapes the screens use.

import type { AvatarTone } from '@/components/healthhub';
import type {
  Appointment, Doctor, HealthRecord, LabBooking, LabPackage, Member, RecordFile, Reminder, SpecialtyId, TestGroup,
} from '@/data/types';
import type { Tables } from '@/types/database';

/** Avatar colours aren't stored; derive one from the id so a person keeps the same colour everywhere. */
const TONES: AvatarTone[] = ['navy', 'teal', 'amber'];
export function toneFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

/** Postgres timestamptz → the local wall-clock string the date helpers expect ("2026-11-19T16:30"). */
export function toLocalStamp(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** A local wall-clock string → an instant Postgres can store. */
export const fromLocalStamp = (stamp: string) => new Date(stamp.replace(' ', 'T')).toISOString();

export function toMember(row: Tables<'family_members'>): Member {
  return {
    id: row.id,
    name: row.full_name,
    relation: row.relation,
    dob: row.dob,
    gender: row.gender ?? 'other',
    bloodGroup: row.blood_group ?? '',
    heightCm: row.height_cm ?? undefined,
    weightKg: row.weight_kg ?? undefined,
    allergies: row.allergies ?? [],
    conditions: row.conditions ?? [],
    tone: toneFor(row.id),
    abha: row.abha_number,
    photo: row.avatar_path,
  };
}

export function toRecord(row: Tables<'records'> & { record_files?: { count: number }[] | Tables<'record_files'>[] }): HealthRecord {
  const files = row.record_files;
  const count = Array.isArray(files)
    ? ('count' in (files[0] ?? {}) ? (files[0] as { count: number }).count : files.length)
    : 0;
  return {
    id: row.id,
    memberId: row.member_id,
    type: row.type,
    title: row.title,
    provider: row.provider_name ?? '',
    date: row.record_date,
    files: count,
    notes: row.notes ?? undefined,
  };
}

/** A stored file plus the signed URL that lets the app show it. */
export function toRecordFile(row: Tables<'record_files'>, signedUrl: string): RecordFile {
  return {
    id: row.id,
    uri: signedUrl,
    name: row.file_name,
    mimeType: row.mime_type,
    size: row.size_bytes,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
  };
}

export function toDoctor(row: Tables<'doctors'>): Doctor {
  return {
    id: row.id,
    name: row.full_name,
    initials: row.initials,
    specialty: row.specialty_label,
    specialtyId: row.specialty_id as SpecialtyId,
    gender: row.gender === 'female' ? 'female' : 'male',
    qualifications: row.qualifications,
    college: row.college ?? '',
    experienceYears: row.experience_years,
    languages: row.languages ?? [],
    feeInr: row.fee_inr,
    rating: Number(row.rating),
    reviewCount: row.review_count,
    patients: row.patients,
    clinic: row.clinic_name,
    area: row.clinic_area,
    address: row.clinic_address,
    // distance needs the user's location; until then it's the straight-line guess the list shows
    distanceKm: distanceFrom(row.lat, row.lng),
    regNo: row.reg_no ?? '',
    about: row.about ?? '',
    verified: row.verified,
    tone: toneFor(row.id),
  };
}

// Indiranagar, the demo's home area
const HOME = { lat: 12.9784, lng: 77.6408 };
function distanceFrom(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return 0;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat - HOME.lat);
  const dLng = toRad(lng - HOME.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(HOME.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}

/** The package's test list is stored as group names; the details screen shows them as expandable groups. */
export function toLabPackage(row: Tables<'lab_packages'>): LabPackage {
  const groups: TestGroup[] = (row.tests ?? []).map((name) => ({ name, count: 0, tests: [] }));
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind === 'test' ? 'test' : 'package',
    category: (row.category ?? undefined) as LabPackage['category'],
    name: row.name,
    testsNote: row.tests_note ?? undefined,
    description: row.description,
    testsCount: row.tests_count,
    reportHours: row.report_hours,
    priceInr: row.price_inr,
    mrpInr: row.mrp_inr,
    fastingHours: row.fasting_hours ?? undefined,
    homeCollection: row.home_collection,
    lab: row.lab_name,
    minAge: row.min_age ?? undefined,
    maxAge: row.max_age ?? undefined,
    groups,
  };
}

export function toAppointment(row: Tables<'appointments'>): Appointment {
  return {
    id: row.id,
    code: row.booking_code,
    memberId: row.member_id,
    doctorId: row.doctor_id,
    slotId: row.slot_id,
    startsAt: toLocalStamp(row.starts_at),
    status: row.status,
    feeInr: row.fee_inr,
    payment: row.payment,
  };
}

export function toLabBooking(row: Tables<'lab_bookings'>): LabBooking {
  return {
    id: row.id,
    code: row.booking_code,
    memberIds: row.member_ids,
    packageId: row.package_id,
    startsAt: toLocalStamp(row.starts_at),
    status: row.status,
    totalInr: row.total_inr,
    address: row.address,
    addressLabel: row.address_label ?? undefined,
    payment: row.payment,
  };
}

export function toReminder(row: Tables<'reminders'>): Reminder {
  return {
    id: row.id,
    memberId: row.member_id,
    kind: row.kind,
    name: row.name,
    dose: row.dose,
    // Postgres time comes back as "08:30:00"
    times: (row.times ?? []).map((t) => t.slice(0, 5)),
    days: row.days ?? [],
    startDate: row.start_date,
    endDate: row.end_date,
    note: row.note ?? undefined,
  };
}
