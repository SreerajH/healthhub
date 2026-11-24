// Medicine and vaccine reminders, and the log of doses taken or skipped.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Reminder } from '@/data/types';
import { useAuth } from '@/lib/auth';
import { fromLocalStamp, toReminder } from '@/lib/map';
import { supabase } from '@/lib/supabase';

export const remindersKey = ['reminders'] as const;
export const doseLogKey = ['reminder-logs'] as const;

export function useReminders() {
  const { user } = useAuth();
  return useQuery({
    queryKey: remindersKey,
    enabled: !!user,
    queryFn: async (): Promise<Reminder[]> => {
      const { data, error } = await supabase.from('reminders').select('*').order('created_at');
      if (error) throw error;
      return data.map(toReminder);
    },
  });
}

export type DoseState = 'taken' | 'skipped';
/** "<reminderId>|<date>|<time>" — what the screens use to identify one dose. */
export type DoseKey = string;
export const doseKey = (reminderId: string, date: string, time: string) => `${reminderId}|${date}|${time}`;
const splitKey = (key: DoseKey) => { const [reminderId, date, time] = key.split('|'); return { reminderId, date, time }; };

/** Every dose logged in the last 90 days, keyed the way the Reminders screen looks them up. */
export function useDoseLog() {
  const { user } = useAuth();
  return useQuery({
    queryKey: doseLogKey,
    enabled: !!user,
    queryFn: async (): Promise<Record<DoseKey, { state: DoseState; at: string }>> => {
      const since = new Date(Date.now() - 90 * 86400000).toISOString();
      const { data, error } = await supabase.from('reminder_logs').select('*').gte('due_at', since);
      if (error) throw error;
      const out: Record<DoseKey, { state: DoseState; at: string }> = {};
      for (const row of data) {
        const due = new Date(row.due_at);
        const p = (n: number) => String(n).padStart(2, '0');
        const date = `${due.getFullYear()}-${p(due.getMonth() + 1)}-${p(due.getDate())}`;
        const time = `${p(due.getHours())}:${p(due.getMinutes())}`;
        const logged = new Date(row.logged_at);
        out[doseKey(row.reminder_id, date, time)] = { state: row.status, at: `${p(logged.getHours())}:${p(logged.getMinutes())}` };
      }
      return out;
    },
  });
}

export function useLogDose() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, state }: { key: DoseKey; state: DoseState }) => {
      const { reminderId, date, time } = splitKey(key);
      const { error } = await supabase.from('reminder_logs').upsert(
        { reminder_id: reminderId, owner_id: user!.id, due_at: fromLocalStamp(`${date}T${time}`), status: state },
        { onConflict: 'reminder_id,due_at' },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: doseLogKey }),
  });
}

export function useClearDose() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: DoseKey) => {
      const { reminderId, date, time } = splitKey(key);
      const { error } = await supabase.from('reminder_logs').delete()
        .eq('reminder_id', reminderId).eq('due_at', fromLocalStamp(`${date}T${time}`));
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: doseLogKey }),
  });
}

export function useAddReminder() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: Omit<Reminder, 'id'>) => {
      const { data, error } = await supabase.from('reminders').insert({
        owner_id: user!.id,
        member_id: r.memberId,
        kind: r.kind,
        name: r.name,
        dose: r.dose,
        times: r.times,
        days: r.days,
        start_date: r.startDate,
        end_date: r.endDate ?? null,
        note: r.note ?? null,
      }).select().single();
      if (error) throw error;
      return toReminder(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: remindersKey }),
  });
}

export function useRemoveReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reminders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: remindersKey }),
  });
}
