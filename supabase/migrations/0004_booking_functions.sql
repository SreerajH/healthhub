-- Bookings are decided on the server. These functions hold the rules (price, slot lock, ownership,
-- eligibility, change windows) and run only for the service role, called by the Edge Functions
-- after they have verified the caller's JWT. The app can no longer write to either booking table.

-- 1. No client-side writes at all (the owner UPDATE policies allowed editing fee_inr and status).
drop policy if exists "appointments update own" on public.appointments;
drop policy if exists "lab bookings update own" on public.lab_bookings;
revoke insert, update, delete on public.appointments from authenticated, anon;
revoke insert, update, delete on public.lab_bookings from authenticated, anon;

-- 2. Booking codes: "HH-" + 6 unambiguous characters.
create or replace function public.new_booking_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := 'HH-' || (select string_agg(substr(chars, 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from appointments where booking_code = code)
          and not exists (select 1 from lab_bookings where booking_code = code);
  end loop;
  return code;
end;
$$;

-- 3. Book a doctor's slot. The fee comes from the doctors table, never from the caller.
create or replace function public.book_appointment(p_owner uuid, p_member uuid, p_doctor uuid, p_slot uuid, p_payment public.payment_method)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot doctor_slots%rowtype;
  v_fee int;
  v_row appointments%rowtype;
begin
  if not exists (select 1 from family_members where id = p_member and owner_id = p_owner) then
    raise exception 'member_not_yours' using errcode = 'P0001';
  end if;

  select fee_inr into v_fee from doctors where id = p_doctor;
  if v_fee is null then
    raise exception 'doctor_not_found' using errcode = 'P0001';
  end if;

  -- lock the row: two people booking the same slot at once queue here, and the second one loses
  select * into v_slot from doctor_slots where id = p_slot for update;
  if not found or v_slot.doctor_id <> p_doctor then
    raise exception 'slot_not_found' using errcode = 'P0001';
  end if;
  if v_slot.is_booked then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;
  if v_slot.starts_at < now() + interval '1 hour' then
    raise exception 'slot_too_soon' using errcode = 'P0001';
  end if;

  update doctor_slots set is_booked = true where id = p_slot;

  insert into appointments (owner_id, member_id, doctor_id, slot_id, starts_at, fee_inr, payment, booking_code)
  values (p_owner, p_member, p_doctor, p_slot, v_slot.starts_at, v_fee, p_payment, new_booking_code())
  returning * into v_row;

  return v_row;
end;
$$;

-- 4. Book a home lab collection. Total = price × people, computed here.
create or replace function public.book_lab(
  p_owner uuid, p_members uuid[], p_package uuid, p_address text, p_address_label text,
  p_starts_at timestamptz, p_payment public.payment_method
)
returns public.lab_bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pkg lab_packages%rowtype;
  v_ids uuid[] := (select array_agg(distinct m) from unnest(p_members) m);
  v_n int;
  v_ist timestamp := p_starts_at at time zone 'Asia/Kolkata';
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_row lab_bookings%rowtype;
  v_age int;
  m record;
begin
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n < 1 or v_n > 8 then
    raise exception 'members_invalid' using errcode = 'P0001';
  end if;
  if (select count(*) from family_members where id = any (v_ids) and owner_id = p_owner) <> v_n then
    raise exception 'member_not_yours' using errcode = 'P0001';
  end if;

  select * into v_pkg from lab_packages where id = p_package;
  if not found then
    raise exception 'package_not_found' using errcode = 'P0001';
  end if;

  -- age rules (a child can't be booked on an adult package)
  for m in select id, dob from family_members where id = any (v_ids) loop
    v_age := date_part('year', age(m.dob));
    if (v_pkg.min_age is not null and v_age < v_pkg.min_age) or (v_pkg.max_age is not null and v_age > v_pkg.max_age) then
      raise exception 'not_eligible' using errcode = 'P0001';
    end if;
  end loop;

  -- collection runs from tomorrow, up to two weeks out, in the phlebotomist's morning rounds
  if v_ist::date <= v_today or v_ist::date > v_today + 14
     or v_ist::time not in ('06:30','07:00','07:30','08:00','08:30','09:00','10:00','10:30','11:00') then
    raise exception 'time_invalid' using errcode = 'P0001';
  end if;

  if length(btrim(coalesce(p_address, ''))) not between 10 and 300 then
    raise exception 'address_invalid' using errcode = 'P0001';
  end if;

  insert into lab_bookings (owner_id, member_ids, package_id, address, address_label, starts_at, total_inr, payment, booking_code)
  values (p_owner, v_ids, p_package, btrim(p_address), nullif(btrim(coalesce(p_address_label, '')), ''), p_starts_at,
          v_pkg.price_inr * v_n, p_payment, new_booking_code())
  returning * into v_row;

  return v_row;
end;
$$;

-- 5. Cancel. Doctor visits can be cancelled up to 2 hours before, lab collections up to 12.
create or replace function public.cancel_booking(p_owner uuid, p_kind text, p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt appointments%rowtype;
  v_lab lab_bookings%rowtype;
begin
  if p_kind = 'doctor' then
    select * into v_appt from appointments where id = p_id and owner_id = p_owner for update;
    if not found then raise exception 'booking_not_found' using errcode = 'P0001'; end if;
    if v_appt.status <> 'upcoming' then raise exception 'not_upcoming' using errcode = 'P0001'; end if;
    if v_appt.starts_at < now() + interval '2 hours' then raise exception 'too_late' using errcode = 'P0001'; end if;

    update appointments set status = 'cancelled', cancel_reason = left(p_reason, 80) where id = p_id;
    if v_appt.slot_id is not null then
      update doctor_slots set is_booked = false where id = v_appt.slot_id;
    end if;
    return jsonb_build_object('id', p_id, 'kind', 'doctor', 'status', 'cancelled', 'refund_inr', case when v_appt.payment = 'later' then 0 else v_appt.fee_inr end);

  elsif p_kind = 'lab' then
    select * into v_lab from lab_bookings where id = p_id and owner_id = p_owner for update;
    if not found then raise exception 'booking_not_found' using errcode = 'P0001'; end if;
    if v_lab.status <> 'upcoming' then raise exception 'not_upcoming' using errcode = 'P0001'; end if;
    if v_lab.starts_at < now() + interval '12 hours' then raise exception 'too_late' using errcode = 'P0001'; end if;

    update lab_bookings set status = 'cancelled', cancel_reason = left(p_reason, 80) where id = p_id;
    return jsonb_build_object('id', p_id, 'kind', 'lab', 'status', 'cancelled', 'refund_inr', case when v_lab.payment = 'later' then 0 else v_lab.total_inr end);
  end if;

  raise exception 'kind_invalid' using errcode = 'P0001';
end;
$$;

-- 6. Reschedule a doctor visit to another slot of the same doctor: lock the new one, free the old one.
create or replace function public.reschedule_appointment(p_owner uuid, p_id uuid, p_slot uuid)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt appointments%rowtype;
  v_slot doctor_slots%rowtype;
begin
  select * into v_appt from appointments where id = p_id and owner_id = p_owner for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0001'; end if;
  if v_appt.status <> 'upcoming' then raise exception 'not_upcoming' using errcode = 'P0001'; end if;
  if v_appt.starts_at < now() + interval '2 hours' then raise exception 'too_late' using errcode = 'P0001'; end if;

  select * into v_slot from doctor_slots where id = p_slot for update;
  if not found or v_slot.doctor_id <> v_appt.doctor_id then raise exception 'slot_not_found' using errcode = 'P0001'; end if;
  if v_slot.is_booked then raise exception 'slot_taken' using errcode = 'P0001'; end if;
  if v_slot.starts_at < now() + interval '1 hour' then raise exception 'slot_too_soon' using errcode = 'P0001'; end if;

  if v_appt.slot_id is not null then
    update doctor_slots set is_booked = false where id = v_appt.slot_id;
  end if;
  update doctor_slots set is_booked = true where id = p_slot;

  update appointments set slot_id = p_slot, starts_at = v_slot.starts_at where id = p_id returning * into v_appt;
  return v_appt;
end;
$$;

-- Only the service role (the Edge Functions) may call any of these.
revoke execute on function public.new_booking_code() from public, anon, authenticated;
revoke execute on function public.book_appointment(uuid, uuid, uuid, uuid, public.payment_method) from public, anon, authenticated;
revoke execute on function public.book_lab(uuid, uuid[], uuid, text, text, timestamptz, public.payment_method) from public, anon, authenticated;
revoke execute on function public.cancel_booking(uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.reschedule_appointment(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.new_booking_code() to service_role;
grant execute on function public.book_appointment(uuid, uuid, uuid, uuid, public.payment_method) to service_role;
grant execute on function public.book_lab(uuid, uuid[], uuid, text, text, timestamptz, public.payment_method) to service_role;
grant execute on function public.cancel_booking(uuid, text, uuid, text) to service_role;
grant execute on function public.reschedule_appointment(uuid, uuid, uuid) to service_role;
