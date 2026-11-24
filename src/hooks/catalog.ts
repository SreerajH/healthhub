// Doctors, specialties, slots and lab tests. This is public catalog data: it changes rarely,
// so it's cached for longer than the family's own records.

import { useQuery } from '@tanstack/react-query';

import type { Doctor, LabPackage } from '@/data/types';
import { toDoctor, toLabPackage, toLocalStamp } from '@/lib/map';
import { supabase } from '@/lib/supabase';

const CATALOG_STALE = 10 * 60 * 1000;

export type Specialty = { id: string; label: string; icon: string; keywords: string };

export function useSpecialties() {
  return useQuery({
    queryKey: ['specialties'],
    staleTime: CATALOG_STALE,
    queryFn: async (): Promise<Specialty[]> => {
      const { data, error } = await supabase.from('specialties').select('*').order('sort_order');
      if (error) throw error;
      return data.map((s) => ({ id: s.id, label: s.label, icon: s.icon, keywords: s.keywords }));
    },
  });
}

export function useDoctors(specialtyId?: string) {
  return useQuery({
    queryKey: ['doctors', specialtyId ?? 'all'],
    staleTime: CATALOG_STALE,
    queryFn: async (): Promise<Doctor[]> => {
      let q = supabase.from('doctors').select('*');
      if (specialtyId) q = q.eq('specialty_id', specialtyId);
      const { data, error } = await q.order('rating', { ascending: false });
      if (error) throw error;
      return data.map(toDoctor);
    },
  });
}

export function useDoctor(id?: string) {
  return useQuery({
    queryKey: ['doctor', id],
    enabled: !!id,
    staleTime: CATALOG_STALE,
    queryFn: async (): Promise<Doctor | null> => {
      const { data, error } = await supabase.from('doctors').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data ? toDoctor(data) : null;
    },
  });
}

export type Slot = { id: string; at: string; time: string; available: boolean };

/** Every free slot a doctor has in the next two weeks, as local wall-clock stamps. */
export function useSlots(doctorId?: string) {
  return useQuery({
    queryKey: ['slots', doctorId],
    enabled: !!doctorId,
    // slots go stale quickly: someone else may have taken one
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Slot[]> => {
      const { data, error } = await supabase
        .from('doctor_slots')
        .select('*')
        .eq('doctor_id', doctorId!)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at');
      if (error) throw error;
      return data.map((s) => {
        const at = toLocalStamp(s.starts_at);
        return { id: s.id, at, time: at.slice(11), available: !s.is_booked };
      });
    },
  });
}

/** The soonest free slot for each doctor in a list — one query for the whole list. */
export function useNextSlots(doctorIds: string[]) {
  const ids = [...doctorIds].sort();
  return useQuery({
    queryKey: ['next-slots', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('doctor_slots')
        .select('doctor_id, starts_at')
        .in('doctor_id', ids)
        .eq('is_booked', false)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(500);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const row of data) if (!out[row.doctor_id]) out[row.doctor_id] = toLocalStamp(row.starts_at);
      return out;
    },
  });
}

export function useLabPackages() {
  return useQuery({
    queryKey: ['lab-packages'],
    staleTime: CATALOG_STALE,
    queryFn: async (): Promise<LabPackage[]> => {
      const { data, error } = await supabase.from('lab_packages').select('*').order('price_inr');
      if (error) throw error;
      return data.map(toLabPackage);
    },
  });
}

export function useLabPackage(id?: string) {
  return useQuery({
    queryKey: ['lab-package', id],
    enabled: !!id,
    staleTime: CATALOG_STALE,
    queryFn: async (): Promise<LabPackage | null> => {
      // works with either the id or the slug, so links can use whichever reads better
      const column = /^[0-9a-f-]{36}$/.test(id!) ? 'id' : 'slug';
      const { data, error } = await supabase.from('lab_packages').select('*').eq(column, id!).maybeSingle();
      if (error) throw error;
      return data ? toLabPackage(data) : null;
    },
  });
}
