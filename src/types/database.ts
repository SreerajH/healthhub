// GENERATED from the Supabase schema (project vsdamzjxylhkskkpxlcz).
// Regenerate after every migration: Supabase MCP → generate_typescript_types.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.18' };
  public: {
    Tables: {
      appointments: {
        Row: {
          booking_code: string;
          cancel_reason: string | null;
          created_at: string;
          doctor_id: string;
          fee_inr: number;
          id: string;
          member_id: string;
          owner_id: string;
          payment: Database['public']['Enums']['payment_method'];
          slot_id: string | null;
          starts_at: string;
          status: Database['public']['Enums']['booking_status'];
        };
        Insert: {
          booking_code: string;
          cancel_reason?: string | null;
          created_at?: string;
          doctor_id: string;
          fee_inr: number;
          id?: string;
          member_id: string;
          owner_id: string;
          payment?: Database['public']['Enums']['payment_method'];
          slot_id?: string | null;
          starts_at: string;
          status?: Database['public']['Enums']['booking_status'];
        };
        Update: {
          booking_code?: string;
          cancel_reason?: string | null;
          created_at?: string;
          doctor_id?: string;
          fee_inr?: number;
          id?: string;
          member_id?: string;
          owner_id?: string;
          payment?: Database['public']['Enums']['payment_method'];
          slot_id?: string | null;
          starts_at?: string;
          status?: Database['public']['Enums']['booking_status'];
        };
        Relationships: [
          { foreignKeyName: 'appointments_doctor_id_fkey'; columns: ['doctor_id']; isOneToOne: false; referencedRelation: 'doctors'; referencedColumns: ['id'] },
          { foreignKeyName: 'appointments_member_id_fkey'; columns: ['member_id']; isOneToOne: false; referencedRelation: 'family_members'; referencedColumns: ['id'] },
          { foreignKeyName: 'appointments_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'appointments_slot_id_fkey'; columns: ['slot_id']; isOneToOne: false; referencedRelation: 'doctor_slots'; referencedColumns: ['id'] },
        ];
      };
      consents: {
        Row: { granted_at: string; id: string; owner_id: string; purpose: string; withdrawn_at: string | null };
        Insert: { granted_at?: string; id?: string; owner_id: string; purpose: string; withdrawn_at?: string | null };
        Update: { granted_at?: string; id?: string; owner_id?: string; purpose?: string; withdrawn_at?: string | null };
        Relationships: [
          { foreignKeyName: 'consents_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      doctor_slots: {
        Row: { doctor_id: string; id: string; is_booked: boolean; starts_at: string };
        Insert: { doctor_id: string; id?: string; is_booked?: boolean; starts_at: string };
        Update: { doctor_id?: string; id?: string; is_booked?: boolean; starts_at?: string };
        Relationships: [
          { foreignKeyName: 'doctor_slots_doctor_id_fkey'; columns: ['doctor_id']; isOneToOne: false; referencedRelation: 'doctors'; referencedColumns: ['id'] },
        ];
      };
      doctors: {
        Row: {
          about: string | null;
          clinic_address: string;
          clinic_area: string;
          clinic_name: string;
          college: string | null;
          created_at: string;
          experience_years: number;
          fee_inr: number;
          full_name: string;
          gender: Database['public']['Enums']['gender'] | null;
          id: string;
          initials: string;
          languages: string[];
          lat: number | null;
          lng: number | null;
          patients: number;
          photo_url: string | null;
          qualifications: string;
          rating: number;
          reg_no: string | null;
          review_count: number;
          specialty_id: string;
          specialty_label: string;
          verified: boolean;
        };
        Insert: {
          about?: string | null;
          clinic_address: string;
          clinic_area: string;
          clinic_name: string;
          college?: string | null;
          created_at?: string;
          experience_years: number;
          fee_inr: number;
          full_name: string;
          gender?: Database['public']['Enums']['gender'] | null;
          id?: string;
          initials: string;
          languages?: string[];
          lat?: number | null;
          lng?: number | null;
          patients?: number;
          photo_url?: string | null;
          qualifications: string;
          rating?: number;
          reg_no?: string | null;
          review_count?: number;
          specialty_id: string;
          specialty_label: string;
          verified?: boolean;
        };
        Update: {
          about?: string | null;
          clinic_address?: string;
          clinic_area?: string;
          clinic_name?: string;
          college?: string | null;
          created_at?: string;
          experience_years?: number;
          fee_inr?: number;
          full_name?: string;
          gender?: Database['public']['Enums']['gender'] | null;
          id?: string;
          initials?: string;
          languages?: string[];
          lat?: number | null;
          lng?: number | null;
          patients?: number;
          photo_url?: string | null;
          qualifications?: string;
          rating?: number;
          reg_no?: string | null;
          review_count?: number;
          specialty_id?: string;
          specialty_label?: string;
          verified?: boolean;
        };
        Relationships: [
          { foreignKeyName: 'doctors_specialty_id_fkey'; columns: ['specialty_id']; isOneToOne: false; referencedRelation: 'specialties'; referencedColumns: ['id'] },
        ];
      };
      family_members: {
        Row: {
          abha_number: string | null;
          allergies: string[];
          avatar_path: string | null;
          blood_group: string | null;
          conditions: string[];
          created_at: string;
          dob: string;
          full_name: string;
          gender: Database['public']['Enums']['gender'] | null;
          height_cm: number | null;
          id: string;
          owner_id: string;
          relation: Database['public']['Enums']['relation'];
          weight_kg: number | null;
        };
        Insert: {
          abha_number?: string | null;
          allergies?: string[];
          avatar_path?: string | null;
          blood_group?: string | null;
          conditions?: string[];
          created_at?: string;
          dob: string;
          full_name: string;
          gender?: Database['public']['Enums']['gender'] | null;
          height_cm?: number | null;
          id?: string;
          owner_id: string;
          relation: Database['public']['Enums']['relation'];
          weight_kg?: number | null;
        };
        Update: {
          abha_number?: string | null;
          allergies?: string[];
          avatar_path?: string | null;
          blood_group?: string | null;
          conditions?: string[];
          created_at?: string;
          dob?: string;
          full_name?: string;
          gender?: Database['public']['Enums']['gender'] | null;
          height_cm?: number | null;
          id?: string;
          owner_id?: string;
          relation?: Database['public']['Enums']['relation'];
          weight_kg?: number | null;
        };
        Relationships: [
          { foreignKeyName: 'family_members_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      lab_bookings: {
        Row: {
          address: string;
          address_label: string | null;
          booking_code: string;
          cancel_reason: string | null;
          created_at: string;
          id: string;
          member_ids: string[];
          owner_id: string;
          package_id: string;
          payment: Database['public']['Enums']['payment_method'];
          starts_at: string;
          status: Database['public']['Enums']['booking_status'];
          total_inr: number;
        };
        Insert: {
          address: string;
          address_label?: string | null;
          booking_code: string;
          cancel_reason?: string | null;
          created_at?: string;
          id?: string;
          member_ids: string[];
          owner_id: string;
          package_id: string;
          payment?: Database['public']['Enums']['payment_method'];
          starts_at: string;
          status?: Database['public']['Enums']['booking_status'];
          total_inr: number;
        };
        Update: {
          address?: string;
          address_label?: string | null;
          booking_code?: string;
          cancel_reason?: string | null;
          created_at?: string;
          id?: string;
          member_ids?: string[];
          owner_id?: string;
          package_id?: string;
          payment?: Database['public']['Enums']['payment_method'];
          starts_at?: string;
          status?: Database['public']['Enums']['booking_status'];
          total_inr?: number;
        };
        Relationships: [
          { foreignKeyName: 'lab_bookings_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'lab_bookings_package_id_fkey'; columns: ['package_id']; isOneToOne: false; referencedRelation: 'lab_packages'; referencedColumns: ['id'] },
        ];
      };
      lab_packages: {
        Row: {
          category: string | null;
          created_at: string;
          description: string;
          fasting_hours: string | null;
          home_collection: boolean;
          id: string;
          image_url: string | null;
          kind: string;
          lab_name: string;
          max_age: number | null;
          min_age: number | null;
          mrp_inr: number;
          name: string;
          price_inr: number;
          report_hours: number;
          slug: string;
          tests: string[];
          tests_count: number;
          tests_note: string | null;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          description?: string;
          fasting_hours?: string | null;
          home_collection?: boolean;
          id?: string;
          image_url?: string | null;
          kind?: string;
          lab_name: string;
          max_age?: number | null;
          min_age?: number | null;
          mrp_inr: number;
          name: string;
          price_inr: number;
          report_hours: number;
          slug: string;
          tests?: string[];
          tests_count: number;
          tests_note?: string | null;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          description?: string;
          fasting_hours?: string | null;
          home_collection?: boolean;
          id?: string;
          image_url?: string | null;
          kind?: string;
          lab_name?: string;
          max_age?: number | null;
          min_age?: number | null;
          mrp_inr?: number;
          name?: string;
          price_inr?: number;
          report_hours?: number;
          slug?: string;
          tests?: string[];
          tests_count?: number;
          tests_note?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: { avatar_path: string | null; created_at: string; full_name: string; id: string; phone: string | null };
        Insert: { avatar_path?: string | null; created_at?: string; full_name?: string; id: string; phone?: string | null };
        Update: { avatar_path?: string | null; created_at?: string; full_name?: string; id?: string; phone?: string | null };
        Relationships: [];
      };
      record_files: {
        Row: {
          created_at: string;
          file_name: string;
          height: number | null;
          id: string;
          mime_type: string;
          owner_id: string;
          record_id: string;
          size_bytes: number;
          storage_path: string;
          width: number | null;
        };
        Insert: {
          created_at?: string;
          file_name: string;
          height?: number | null;
          id?: string;
          mime_type: string;
          owner_id: string;
          record_id: string;
          size_bytes: number;
          storage_path: string;
          width?: number | null;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          height?: number | null;
          id?: string;
          mime_type?: string;
          owner_id?: string;
          record_id?: string;
          size_bytes?: number;
          storage_path?: string;
          width?: number | null;
        };
        Relationships: [
          { foreignKeyName: 'record_files_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'record_files_record_id_fkey'; columns: ['record_id']; isOneToOne: false; referencedRelation: 'records'; referencedColumns: ['id'] },
        ];
      };
      records: {
        Row: {
          created_at: string;
          id: string;
          member_id: string;
          notes: string | null;
          owner_id: string;
          provider_name: string | null;
          record_date: string;
          title: string;
          type: Database['public']['Enums']['record_type'];
        };
        Insert: {
          created_at?: string;
          id?: string;
          member_id: string;
          notes?: string | null;
          owner_id: string;
          provider_name?: string | null;
          record_date: string;
          title: string;
          type: Database['public']['Enums']['record_type'];
        };
        Update: {
          created_at?: string;
          id?: string;
          member_id?: string;
          notes?: string | null;
          owner_id?: string;
          provider_name?: string | null;
          record_date?: string;
          title?: string;
          type?: Database['public']['Enums']['record_type'];
        };
        Relationships: [
          { foreignKeyName: 'records_member_id_fkey'; columns: ['member_id']; isOneToOne: false; referencedRelation: 'family_members'; referencedColumns: ['id'] },
          { foreignKeyName: 'records_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      reminder_logs: {
        Row: {
          due_at: string;
          id: string;
          logged_at: string;
          owner_id: string;
          reminder_id: string;
          status: Database['public']['Enums']['dose_status'];
        };
        Insert: {
          due_at: string;
          id?: string;
          logged_at?: string;
          owner_id: string;
          reminder_id: string;
          status: Database['public']['Enums']['dose_status'];
        };
        Update: {
          due_at?: string;
          id?: string;
          logged_at?: string;
          owner_id?: string;
          reminder_id?: string;
          status?: Database['public']['Enums']['dose_status'];
        };
        Relationships: [
          { foreignKeyName: 'reminder_logs_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'reminder_logs_reminder_id_fkey'; columns: ['reminder_id']; isOneToOne: false; referencedRelation: 'reminders'; referencedColumns: ['id'] },
        ];
      };
      reminders: {
        Row: {
          created_at: string;
          days: number[];
          dose: string;
          end_date: string | null;
          id: string;
          kind: Database['public']['Enums']['reminder_kind'];
          member_id: string;
          name: string;
          note: string | null;
          owner_id: string;
          refill_alert: boolean;
          start_date: string;
          times: string[];
        };
        Insert: {
          created_at?: string;
          days?: number[];
          dose?: string;
          end_date?: string | null;
          id?: string;
          kind: Database['public']['Enums']['reminder_kind'];
          member_id: string;
          name: string;
          note?: string | null;
          owner_id: string;
          refill_alert?: boolean;
          start_date: string;
          times?: string[];
        };
        Update: {
          created_at?: string;
          days?: number[];
          dose?: string;
          end_date?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['reminder_kind'];
          member_id?: string;
          name?: string;
          note?: string | null;
          owner_id?: string;
          refill_alert?: boolean;
          start_date?: string;
          times?: string[];
        };
        Relationships: [
          { foreignKeyName: 'reminders_member_id_fkey'; columns: ['member_id']; isOneToOne: false; referencedRelation: 'family_members'; referencedColumns: ['id'] },
          { foreignKeyName: 'reminders_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      specialties: {
        Row: { icon: string; id: string; keywords: string; label: string; sort_order: number };
        Insert: { icon: string; id: string; keywords?: string; label: string; sort_order?: number };
        Update: { icon?: string; id?: string; keywords?: string; label?: string; sort_order?: number };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      seed_sample_family: { Args: Record<string, never>; Returns: Json };
    };
    Enums: {
      booking_status: 'upcoming' | 'completed' | 'cancelled';
      dose_status: 'taken' | 'skipped';
      gender: 'female' | 'male' | 'other';
      payment_method: 'upi' | 'card' | 'later';
      record_type: 'prescription' | 'lab_report' | 'scan' | 'vaccine' | 'discharge' | 'other';
      relation: 'self' | 'spouse' | 'child' | 'parent' | 'sibling' | 'other';
      reminder_kind: 'medicine' | 'vaccine';
    };
    CompositeTypes: { [_ in never]: never };
  };
};

// Shorthands for the single public schema this app uses.
type PublicSchema = Database['public'];
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];

export const Constants = {
  booking_status: ['upcoming', 'completed', 'cancelled'],
  dose_status: ['taken', 'skipped'],
  gender: ['female', 'male', 'other'],
  payment_method: ['upi', 'card', 'later'],
  record_type: ['prescription', 'lab_report', 'scan', 'vaccine', 'discharge', 'other'],
  relation: ['self', 'spouse', 'child', 'parent', 'sibling', 'other'],
  reminder_kind: ['medicine', 'vaccine'],
} as const;
