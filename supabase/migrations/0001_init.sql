-- HealthHub initial schema.
-- Health data is sensitive, so every private table is owner-scoped and RLS is on everywhere.
-- Catalog tables are world-readable but never client-writable; bookings are written only by Edge Functions.

-- ---------- extensions ----------
create extension if not exists pgcrypto with schema extensions;

-- ---------- enums ----------
create type public.relation as enum ('self', 'spouse', 'child', 'parent', 'sibling', 'other');
create type public.gender as enum ('female', 'male', 'other');
create type public.record_type as enum ('prescription', 'lab_report', 'scan', 'vaccine', 'discharge', 'other');
create type public.booking_status as enum ('upcoming', 'completed', 'cancelled');
create type public.reminder_kind as enum ('medicine', 'vaccine');
create type public.dose_status as enum ('taken', 'skipped');
create type public.payment_method as enum ('upi', 'card', 'later');

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  avatar_path text,
  created_at timestamptz not null default now()
);

-- ---------- family members ----------
create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 2 and 80),
  relation public.relation not null,
  dob date not null check (dob <= current_date),
  gender public.gender,
  blood_group text check (blood_group is null or blood_group in ('A+','A-','B+','B-','O+','O-','AB+','AB-')),
  height_cm numeric(5,1) check (height_cm is null or height_cm between 30 and 250),
  weight_kg numeric(5,1) check (weight_kg is null or weight_kg between 1 and 300),
  allergies text[] not null default '{}',
  conditions text[] not null default '{}',
  avatar_path text,
  abha_number text check (abha_number is null or abha_number ~ '^\d{14}$'),
  created_at timestamptz not null default now()
);
-- one "self" per account
create unique index family_members_one_self on public.family_members (owner_id) where relation = 'self';
create index family_members_owner_idx on public.family_members (owner_id);

-- ---------- records ----------
create table public.records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  type public.record_type not null,
  title text not null check (length(btrim(title)) between 1 and 120),
  record_date date not null check (record_date <= current_date),
  provider_name text,
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now()
);
create index records_owner_idx on public.records (owner_id);
create index records_member_date_idx on public.records (member_id, record_date desc);

create table public.record_files (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10 * 1024 * 1024),
  width int,
  height int,
  created_at timestamptz not null default now()
);
create index record_files_record_idx on public.record_files (record_id);
create index record_files_owner_idx on public.record_files (owner_id);

-- ---------- catalog: specialties, doctors, slots ----------
create table public.specialties (
  id text primary key,
  label text not null,
  icon text not null,
  keywords text not null default '',
  sort_order int not null default 0
);

create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  initials text not null,
  specialty_id text not null references public.specialties (id),
  specialty_label text not null,
  gender public.gender,
  qualifications text not null,
  college text,
  experience_years int not null check (experience_years between 0 and 70),
  languages text[] not null default '{}',
  fee_inr int not null check (fee_inr between 0 and 100000),
  rating numeric(2,1) not null default 0 check (rating between 0 and 5),
  review_count int not null default 0,
  patients int not null default 0,
  clinic_name text not null,
  clinic_area text not null,
  clinic_address text not null,
  lat double precision,
  lng double precision,
  reg_no text,
  about text,
  photo_url text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index doctors_specialty_idx on public.doctors (specialty_id);
create index doctors_fee_idx on public.doctors (fee_inr);

create table public.doctor_slots (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors (id) on delete cascade,
  starts_at timestamptz not null,
  is_booked boolean not null default false,
  unique (doctor_id, starts_at)
);
create index doctor_slots_lookup_idx on public.doctor_slots (doctor_id, starts_at) where is_booked = false;

-- ---------- catalog: lab packages ----------
create table public.lab_packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  kind text not null default 'package' check (kind in ('package', 'test')),
  category text,
  name text not null,
  tests_note text,
  description text not null default '',
  tests text[] not null default '{}',
  tests_count int not null check (tests_count > 0),
  report_hours int not null check (report_hours > 0),
  price_inr int not null check (price_inr >= 0),
  mrp_inr int not null check (mrp_inr >= 0),
  fasting_hours text,
  home_collection boolean not null default true,
  lab_name text not null,
  min_age int,
  max_age int,
  image_url text,
  created_at timestamptz not null default now()
);

-- ---------- bookings ----------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  doctor_id uuid not null references public.doctors (id),
  slot_id uuid references public.doctor_slots (id),
  starts_at timestamptz not null,
  status public.booking_status not null default 'upcoming',
  fee_inr int not null check (fee_inr >= 0),
  payment public.payment_method not null default 'upi',
  booking_code text not null unique,
  cancel_reason text,
  created_at timestamptz not null default now()
);
create index appointments_owner_idx on public.appointments (owner_id, starts_at desc);
create index appointments_member_idx on public.appointments (member_id);
create index appointments_doctor_idx on public.appointments (doctor_id);
create index appointments_slot_idx on public.appointments (slot_id);

create table public.lab_bookings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  member_ids uuid[] not null check (array_length(member_ids, 1) between 1 and 8),
  package_id uuid not null references public.lab_packages (id),
  address text not null,
  address_label text,
  starts_at timestamptz not null,
  status public.booking_status not null default 'upcoming',
  total_inr int not null check (total_inr >= 0),
  payment public.payment_method not null default 'upi',
  booking_code text not null unique,
  cancel_reason text,
  created_at timestamptz not null default now()
);
create index lab_bookings_owner_idx on public.lab_bookings (owner_id, starts_at desc);
create index lab_bookings_package_idx on public.lab_bookings (package_id);

-- ---------- reminders ----------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  kind public.reminder_kind not null,
  name text not null check (length(btrim(name)) between 2 and 80),
  dose text not null default '',
  times time[] not null default '{}',
  days int[] not null default '{}' check (days <@ array[0,1,2,3,4,5,6]),
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  note text,
  refill_alert boolean not null default false,
  created_at timestamptz not null default now()
);
create index reminders_owner_idx on public.reminders (owner_id);
create index reminders_member_idx on public.reminders (member_id);

create table public.reminder_logs (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.reminders (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  due_at timestamptz not null,
  status public.dose_status not null,
  logged_at timestamptz not null default now(),
  unique (reminder_id, due_at)
);
create index reminder_logs_owner_idx on public.reminder_logs (owner_id, due_at desc);
create index reminder_logs_reminder_idx on public.reminder_logs (reminder_id);

-- ---------- consents (DPDP-style) ----------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  purpose text not null,
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
create index consents_owner_idx on public.consents (owner_id);

-- ---------- signup trigger: profile + "self" member ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), '');
  v_dob date := nullif(new.raw_user_meta_data ->> 'dob', '')::date;
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, v_name, new.phone)
  on conflict (id) do nothing;

  -- the account holder is always the first family member; the app fills in the details later
  if v_name <> '' then
    insert into public.family_members (owner_id, full_name, relation, dob)
    values (new.id, v_name, 'self', coalesce(v_dob, current_date))
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- row-level security ----------
alter table public.profiles enable row level security;
alter table public.family_members enable row level security;
alter table public.records enable row level security;
alter table public.record_files enable row level security;
alter table public.appointments enable row level security;
alter table public.lab_bookings enable row level security;
alter table public.reminders enable row level security;
alter table public.reminder_logs enable row level security;
alter table public.consents enable row level security;
alter table public.specialties enable row level security;
alter table public.doctors enable row level security;
alter table public.doctor_slots enable row level security;
alter table public.lab_packages enable row level security;

-- profiles: your own row only
create policy "profiles are self-service" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles insert self" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles update self" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- owner-scoped tables: the same four policies on each
do $$
declare t text;
begin
  foreach t in array array['family_members', 'records', 'record_files', 'reminders', 'reminder_logs', 'consents']
  loop
    execute format($f$
      create policy "%1$s select own" on public.%1$I
        for select to authenticated using ((select auth.uid()) = owner_id);
      create policy "%1$s insert own" on public.%1$I
        for insert to authenticated with check ((select auth.uid()) = owner_id);
      create policy "%1$s update own" on public.%1$I
        for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
      create policy "%1$s delete own" on public.%1$I
        for delete to authenticated using ((select auth.uid()) = owner_id);
    $f$, t);
  end loop;
end $$;

-- bookings: readable and cancellable by the owner, but only Edge Functions create them
create policy "appointments select own" on public.appointments
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "appointments update own" on public.appointments
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "lab bookings select own" on public.lab_bookings
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "lab bookings update own" on public.lab_bookings
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- catalog: anyone signed in can read, nobody can write from the client
create policy "specialties are readable" on public.specialties for select to authenticated, anon using (true);
create policy "doctors are readable" on public.doctors for select to authenticated, anon using (true);
create policy "doctor slots are readable" on public.doctor_slots for select to authenticated, anon using (true);
create policy "lab packages are readable" on public.lab_packages for select to authenticated, anon using (true);

-- ---------- guards ----------
-- a record, reminder or booking can only point at a family member you own
create or replace function public.assert_member_owned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.family_members m
    where m.id = new.member_id and m.owner_id = new.owner_id
  ) then
    raise exception 'member % does not belong to this account', new.member_id using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger records_member_owned before insert or update on public.records
  for each row execute function public.assert_member_owned();
create trigger reminders_member_owned before insert or update on public.reminders
  for each row execute function public.assert_member_owned();
create trigger appointments_member_owned before insert or update on public.appointments
  for each row execute function public.assert_member_owned();

-- a record file must belong to the same account as its record
create or replace function public.assert_record_owned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.records r
    where r.id = new.record_id and r.owner_id = new.owner_id
  ) then
    raise exception 'record % does not belong to this account', new.record_id using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger record_files_record_owned before insert or update on public.record_files
  for each row execute function public.assert_record_owned();

-- the "self" member can't be deleted: it's the account holder
create or replace function public.protect_self_member()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.relation = 'self' then
    raise exception 'the account holder cannot be removed from the family' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger family_members_protect_self before delete on public.family_members
  for each row execute function public.protect_self_member();
