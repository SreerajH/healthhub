import { ageOf, todayISO, type Member } from '@/data/types';

/** "You", "Spouse", "Son", "Daughter", "Mother", "Father", "Brother", "Sister", "Family" */
export function relationLabel(m: Pick<Member, 'relation' | 'gender'>) {
  const f = m.gender === 'female', male = m.gender === 'male';
  switch (m.relation) {
    case 'self': return 'You';
    case 'spouse': return 'Spouse';
    case 'child': return f ? 'Daughter' : male ? 'Son' : 'Child';
    case 'parent': return f ? 'Mother' : male ? 'Father' : 'Parent';
    case 'sibling': return f ? 'Sister' : male ? 'Brother' : 'Sibling';
    default: return 'Family';
  }
}

/** "34 yrs" (or "8 months" for babies) */
export function ageLabel(dob: string) {
  const years = ageOf(dob);
  if (years >= 1) return `${years} yr${years === 1 ? '' : 's'}`;
  const [y, m, d] = dob.split('-').map(Number);
  const [ty, tm, td] = todayISO().split('-').map(Number);
  const months = Math.max(0, (ty - y) * 12 + (tm - m) - (td < d ? 1 : 0));
  return `${months} month${months === 1 ? '' : 's'}`;
}

export const firstName = (m: Pick<Member, 'name'>) => m.name.split(' ')[0];

/** "Aarav", "Aarav and Priya", "Aarav, Priya and Sunita" */
export const namesList = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
