// The signed-in account's family members.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Member } from '@/data/types';
import { useAuth } from '@/lib/auth';
import { toMember } from '@/lib/map';
import { supabase } from '@/lib/supabase';

export const familyKey = ['family'] as const;

export function useMembers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: familyKey,
    enabled: !!user,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from('family_members')
        .select('*')
        // the account holder first, then whoever was added first
        .order('relation', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = data.map(toMember);
      return [...rows.filter((m) => m.relation === 'self'), ...rows.filter((m) => m.relation !== 'self')];
    },
  });
}

export function useMember(id?: string) {
  const { data: members } = useMembers();
  return members?.find((m) => m.id === id);
}

type MemberInput = Omit<Member, 'id' | 'tone'>;

const toRow = (m: Partial<MemberInput>) => ({
  ...(m.name !== undefined && { full_name: m.name }),
  ...(m.relation !== undefined && { relation: m.relation }),
  ...(m.dob !== undefined && { dob: m.dob }),
  ...(m.gender !== undefined && { gender: m.gender }),
  ...(m.bloodGroup !== undefined && { blood_group: m.bloodGroup || null }),
  ...(m.heightCm !== undefined && { height_cm: m.heightCm ?? null }),
  ...(m.weightKg !== undefined && { weight_kg: m.weightKg ?? null }),
  ...(m.allergies !== undefined && { allergies: m.allergies }),
  ...(m.conditions !== undefined && { conditions: m.conditions }),
  ...(m.photo !== undefined && { avatar_path: m.photo ?? null }),
});

export function useAddMember() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: MemberInput) => {
      const { data, error } = await supabase
        .from('family_members')
        .insert({ ...toRow(m), owner_id: user!.id, relation: m.relation, full_name: m.name, dob: m.dob })
        .select()
        .single();
      if (error) throw error;
      return toMember(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: familyKey }),
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...m }: Partial<MemberInput> & { id: string }) => {
      const { data, error } = await supabase.from('family_members').update(toRow(m)).eq('id', id).select().single();
      if (error) throw error;
      return toMember(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: familyKey }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('family_members').delete().eq('id', id);
      // the database refuses to delete the account holder
      if (error) throw new Error(error.message.includes('account holder') ? 'You can\'t remove yourself from your own family.' : error.message);
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** Demo only: loads the Mehta family, records, reminders and bookings into this account. */
export function useLoadSampleFamily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('seed_sample_family');
      if (error) {
        if (error.message.includes('already has family')) throw new Error('Your account already has family members.');
        if (error.message.includes('finish your profile')) throw new Error('Finish your profile first.');
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}
