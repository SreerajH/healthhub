// Appointments and lab bookings.
//
// Bookings are written only by Edge Functions (book-appointment, book-lab, cancel-or-reschedule),
// so the price, the slot lock and the change windows are decided on the server. The app can read
// its own bookings and ask the server to change them; it can't edit the tables itself.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Appointment, LabBooking, PaymentMethod } from '@/data/types';
import { useAuth } from '@/lib/auth';
import { fromLocalStamp, toAppointment, toLabBooking } from '@/lib/map';
import { supabase } from '@/lib/supabase';

export const bookingsKey = ['bookings'] as const;

export function useAppointments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...bookingsKey, 'appointments'],
    enabled: !!user,
    queryFn: async (): Promise<Appointment[]> => {
      const { data, error } = await supabase.from('appointments').select('*').order('starts_at');
      if (error) throw error;
      return data.map(toAppointment);
    },
  });
}

export function useLabBookings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...bookingsKey, 'lab'],
    enabled: !!user,
    queryFn: async (): Promise<LabBooking[]> => {
      const { data, error } = await supabase.from('lab_bookings').select('*').order('starts_at');
      if (error) throw error;
      return data.map(toLabBooking);
    },
  });
}

/** Both kinds together, for the Bookings tab and "Coming up". */
// one shared empty list: a fresh `[]` each render would look like new data to every memo downstream
const NONE: never[] = [];

export function useBookings() {
  const appointments = useAppointments();
  const labs = useLabBookings();
  return {
    appointments: appointments.data ?? NONE,
    labBookings: labs.data ?? NONE,
    isLoading: appointments.isLoading || labs.isLoading,
    error: appointments.error ?? labs.error ?? null,
    refetch: async () => { await Promise.all([appointments.refetch(), labs.refetch()]); },
  };
}

export type NewAppointment = { memberId: string; doctorId: string; slotId: string; at: string; payment: PaymentMethod };
export type NewLabBooking = { memberIds: string[]; packageId: string; addressId: string; address: string; addressLabel: string; at: string; payment: PaymentMethod };

export function useBookAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewAppointment) => {
      const { data, error } = await supabase.functions.invoke<{ booking: { id: string } }>('book-appointment', {
        body: { member_id: input.memberId, doctor_id: input.doctorId, slot_id: input.slotId, payment: input.payment },
      });
      if (error) throw await bookingError(error);
      return data!.booking.id;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useBookLab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewLabBooking) => {
      const { data, error } = await supabase.functions.invoke<{ booking: { id: string } }>('book-lab', {
        body: {
          member_ids: input.memberIds,
          package_id: input.packageId,
          address: input.address,
          address_label: input.addressLabel,
          starts_at: fromLocalStamp(input.at),
          payment: input.payment,
        },
      });
      if (error) throw await bookingError(error);
      return data!.booking.id;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export type CancelResult = { id: string; kind: 'doctor' | 'lab'; status: 'cancelled'; refund_inr: number };

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, kind, reason }: { id: string; kind: 'doctor' | 'lab'; reason?: string }) => {
      const { data, error } = await supabase.functions.invoke<{ result: CancelResult }>('cancel-or-reschedule', {
        body: { action: 'cancel', kind, id, reason: reason ?? '' },
      });
      if (error) throw await bookingError(error);
      return data!.result;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useRescheduleAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, slotId }: { id: string; slotId: string }) => {
      const { error } = await supabase.functions.invoke('cancel-or-reschedule', {
        body: { action: 'reschedule', kind: 'doctor', id, slot_id: slotId },
      });
      if (error) throw await bookingError(error);
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

/**
 * The functions answer failures with a plain-language message ("That slot has just been taken…").
 * supabase-js wraps non-2xx replies in an error whose `context` is the raw Response, so read it.
 */
async function bookingError(error: { message: string; context?: unknown }) {
  const res = error.context;
  if (res instanceof Response) {
    try {
      const body = await res.clone().json();
      if (typeof body?.error === 'string') return new Error(body.error);
    } catch {
      // not JSON: fall through to the generic message
    }
  }
  if (error.message.toLowerCase().includes('failed to send')) {
    return new Error('Couldn’t reach HealthHub. Check your connection and try again.');
  }
  return new Error('Couldn’t complete that. Try again.');
}
