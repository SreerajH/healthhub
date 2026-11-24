// Consent, one row per purpose (DPDP-style): granted_at when given, withdrawn_at when taken back.
// "account" is needed to use the app at all; the rest are asked for at sign-up and again, just in time,
// before the feature that needs them (adding family, uploading a record, booking).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';

import { useAuth } from './auth';
import { supabase } from './supabase';

export type Purpose = 'account' | 'family' | 'records' | 'bookings' | 'analytics';

export const PURPOSES: { id: Purpose; title: string; what: string; why: string; required?: boolean }[] = [
  {
    id: 'account', required: true, title: 'Your account and profile',
    what: 'Your name, date of birth, gender and the email or phone you sign in with.',
    why: 'To run your account and show your own health profile.',
  },
  {
    id: 'family', title: 'Family members',
    what: 'Names, relations, dates of birth, blood groups and allergies of the people you add.',
    why: 'So you can keep records, bookings and reminders for them.',
  },
  {
    id: 'records', title: 'Health records',
    what: 'The reports, prescriptions, scans and photos you upload, and their details.',
    why: 'To store them privately for you and let you share them when you choose.',
  },
  {
    id: 'bookings', title: 'Bookings',
    what: 'The patient’s name, age and your contact details for each booking.',
    why: 'Shared only with the doctor or lab you book, to confirm the visit.',
  },
  {
    id: 'analytics', title: 'Help improve HealthHub',
    what: 'Anonymous app usage, like which screens are opened. Never health information.',
    why: 'To find what’s confusing and fix it.',
  },
];

export const purposeTitle = (p: Purpose) => PURPOSES.find((x) => x.id === p)!.title;

type ConsentRow = { id: string; purpose: string; granted_at: string; withdrawn_at: string | null };
const key = (uid?: string) => ['consents', uid] as const;

/** Every consent row for this account, newest first. */
export function useConsentRows() {
  const { user } = useAuth();
  return useQuery({
    queryKey: key(user?.id),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('consents')
        .select('id, purpose, granted_at, withdrawn_at').order('granted_at', { ascending: false });
      if (error) throw error;
      return data as ConsentRow[];
    },
  });
}

/** The purposes currently granted (a row with no withdrawn_at). */
export function useConsents() {
  const q = useConsentRows();
  const active = new Set((q.data ?? []).filter((r) => !r.withdrawn_at).map((r) => r.purpose as Purpose));
  return { ...q, active, has: (p: Purpose) => active.has(p) };
}

export function useSetConsents() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    /** grant the ones in `grant` that aren't active yet; withdraw the active ones in `withdraw` */
    mutationFn: async ({ grant = [], withdraw = [] }: { grant?: Purpose[]; withdraw?: Purpose[] }) => {
      if (!user) throw new Error('Sign in first');
      const rows = qc.getQueryData<ConsentRow[]>(key(user.id)) ?? [];
      const active = new Set(rows.filter((r) => !r.withdrawn_at).map((r) => r.purpose));
      const toGrant = grant.filter((p) => !active.has(p));
      if (toGrant.length) {
        const { error } = await supabase.from('consents').insert(toGrant.map((purpose) => ({ owner_id: user.id, purpose })));
        if (error) throw error;
      }
      if (withdraw.length) {
        const { error } = await supabase.from('consents').update({ withdrawn_at: new Date().toISOString() })
          .in('purpose', withdraw).is('withdrawn_at', null);
        if (error) throw error;
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key(user?.id) }),
  });
}

// ---------- just-in-time ask ----------
type Ask = { purpose: Purpose; resolve: (ok: boolean) => void } | null;
export const useConsentAsk = create<{ ask: Ask; set: (a: Ask) => void }>((set) => ({ ask: null, set: (ask) => set({ ask }) }));

/**
 * `const ensure = useEnsureConsent(); if (!(await ensure('records'))) return;`
 * Resolves true straight away when the purpose is already granted; otherwise shows ConsentPrompt.
 */
export function useEnsureConsent() {
  const { has } = useConsents();
  const setAsk = useConsentAsk((s) => s.set);
  return (purpose: Purpose) =>
    has(purpose) ? Promise.resolve(true) : new Promise<boolean>((resolve) => setAsk({ purpose, resolve }));
}
