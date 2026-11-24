-- Demo data: loads the Mehta family into the CALLER's own account, so a fresh sign-in has
-- something to show. Bookings can't be created from the client (no insert policy), so this runs
-- as SECURITY DEFINER — but it only ever writes fixed demo rows for auth.uid(), and refuses to
-- run on an account that already has family members. Remove before a real launch.

create or replace function public.seed_sample_family()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_self uuid;
  v_priya uuid;
  v_kabir uuid;
  v_sunita uuid;
  v_metformin uuid;
  v_slot record;
  v_doctor uuid;
  v_pkg uuid;
  d date;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  ist text := 'Asia/Kolkata';
  code text;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  if exists (select 1 from family_members where owner_id = uid and relation <> 'self') then
    raise exception 'this account already has family members' using errcode = 'P0001';
  end if;

  select id into v_self from family_members where owner_id = uid and relation = 'self';
  if v_self is null then
    raise exception 'finish your profile first' using errcode = 'P0001';
  end if;

  -- ---------- family ----------
  insert into family_members (owner_id, full_name, relation, dob, gender, blood_group, height_cm, weight_kg, allergies)
  values (uid, 'Priya Mehta', 'spouse', '1994-03-21', 'female', 'O+', 162, 58, array['Penicillin'])
  returning id into v_priya;

  insert into family_members (owner_id, full_name, relation, dob, gender, blood_group, height_cm, weight_kg, allergies)
  values (uid, 'Kabir Mehta', 'child', '2020-02-03', 'male', 'B+', 116, 21, array['Peanuts', 'Dust mites'])
  returning id into v_kabir;

  insert into family_members (owner_id, full_name, relation, dob, gender, blood_group, height_cm, weight_kg, conditions)
  values (uid, 'Sunita Mehta', 'parent', '1958-06-30', 'female', 'A+', 155, 64, array['Type 2 diabetes'])
  returning id into v_sunita;

  -- ---------- records (dated back from today, so they always look recent) ----------
  insert into records (owner_id, member_id, type, title, provider_name, record_date, notes) values
    (uid, v_kabir,  'prescription', 'Fever and cough', 'Dr. Ananya Rao · Rainbow Children''s Clinic', today - 6,
       'Paracetamol 250 mg if fever is above 100°F. Steam twice a day. Review in 3 days if the cough continues.'),
    (uid, v_self,   'lab_report', 'Complete blood count (CBC)', 'Lal PathLabs, Indiranagar', today - 10, null),
    (uid, v_sunita, 'scan', 'Chest X-ray', 'Manipal Hospital, Old Airport Road', today - 21, null),
    (uid, v_sunita, 'lab_report', 'Thyroid profile (T3, T4, TSH)', 'Lal PathLabs, Indiranagar', today - 45, null),
    (uid, v_sunita, 'discharge', 'Cataract surgery — left eye', 'Narayana Nethralaya, Rajajinagar', today - 77, null),
    (uid, v_sunita, 'prescription', 'Diabetes review', 'Dr. Meera Iyer · Endocrinology', today - 91, null),
    (uid, v_priya,  'lab_report', 'Vitamin D and B12', 'Thyrocare, HAL 2nd Stage', today - 127, null),
    (uid, v_priya,  'prescription', 'Seasonal allergy', 'Dr. Ritu Sharma · Cloudnine, Old Airport Road', today - 168, null),
    (uid, v_self,   'scan', 'Ultrasound — abdomen', 'Aster CMI, Hebbal', today - 210, null),
    (uid, v_kabir,  'vaccine', 'Typhoid conjugate vaccine', 'Rainbow Children''s Clinic', today - 646, null),
    (uid, v_kabir,  'vaccine', 'MMR vaccine — dose 1', 'Rainbow Children''s Clinic', today - 1708, null),
    (uid, v_self,   'vaccine', 'COVID-19 booster', 'Apollo Clinic, Indiranagar', today - 1582, null);

  -- ---------- reminders ----------
  insert into reminders (owner_id, member_id, kind, name, dose, times, days, start_date, note, refill_alert)
  values (uid, v_sunita, 'medicine', 'Metformin 500 mg', '1 tablet', array['08:30', '21:00']::time[],
          array[0,1,2,3,4,5,6], today - 260, 'After breakfast and after dinner', true)
  returning id into v_metformin;

  insert into reminders (owner_id, member_id, kind, name, dose, times, days, start_date, end_date, note)
  values (uid, v_self, 'medicine', 'Vitamin D3 60,000 IU', '1 sachet', array['14:00']::time[],
          array[extract(dow from today)::int], today - 42, today + 49, 'Weekly');

  insert into reminders (owner_id, member_id, kind, name, dose, times, days, start_date, note) values
    (uid, v_kabir,  'vaccine', 'MMR vaccine — dose 2', '1 dose', array['10:00']::time[], '{}', today + 3, 'Recommended at 4–6 years'),
    (uid, v_sunita, 'vaccine', 'Flu vaccine (yearly)', '1 dose', array['10:00']::time[], '{}', today + 14, 'Recommended every year for 65+');

  -- Sunita hasn't missed a Metformin dose in 12 days (the streak band), plus this morning's
  for i in 1..12 loop
    d := today - i;
    insert into reminder_logs (reminder_id, owner_id, due_at, status, logged_at) values
      (v_metformin, uid, (d + time '08:30') at time zone ist, 'taken', (d + time '08:35') at time zone ist),
      (v_metformin, uid, (d + time '21:00') at time zone ist, 'taken', (d + time '21:10') at time zone ist);
  end loop;
  if (now() at time zone ist)::time > time '08:30' then
    insert into reminder_logs (reminder_id, owner_id, due_at, status, logged_at)
    values (v_metformin, uid, (today + time '08:30') at time zone ist, 'taken', (today + time '08:34') at time zone ist);
  end if;

  -- ---------- bookings ----------
  -- Kabir with Dr. Ananya Rao, the first free slot two or more days out
  select id into v_doctor from doctors where full_name = 'Dr. Ananya Rao';
  select * into v_slot from doctor_slots
    where doctor_id = v_doctor and not is_booked and starts_at >= now() + interval '2 days'
    order by starts_at limit 1 for update;
  if found then
    update doctor_slots set is_booked = true where id = v_slot.id;
    code := 'HH-' || upper(substr(md5(random()::text), 1, 6));
    insert into appointments (owner_id, member_id, doctor_id, slot_id, starts_at, fee_inr, payment, booking_code)
    values (uid, v_kabir, v_doctor, v_slot.id, v_slot.starts_at, 600, 'upi', code);
  end if;

  -- Sunita with Dr. Vikram Shetty, about a week and a half out
  select id into v_doctor from doctors where full_name = 'Dr. Vikram Shetty';
  select * into v_slot from doctor_slots
    where doctor_id = v_doctor and not is_booked and starts_at >= now() + interval '10 days'
    order by starts_at limit 1 for update;
  if found then
    update doctor_slots set is_booked = true where id = v_slot.id;
    code := 'HH-' || upper(substr(md5(random()::text), 1, 6));
    insert into appointments (owner_id, member_id, doctor_id, slot_id, starts_at, fee_inr, payment, booking_code)
    values (uid, v_sunita, v_doctor, v_slot.id, v_slot.starts_at, 700, 'upi', code);
  end if;

  -- and a past visit, so Bookings → Past isn't empty
  select id into v_doctor from doctors where full_name = 'Dr. Meera Iyer';
  code := 'HH-' || upper(substr(md5(random()::text), 1, 6));
  insert into appointments (owner_id, member_id, doctor_id, starts_at, status, fee_inr, payment, booking_code)
  values (uid, v_sunita, v_doctor, ((today - 91) + time '10:30') at time zone ist, 'completed', 800, 'upi', code);

  -- Aarav and Priya's full body checkup, home collection in four days
  select id into v_pkg from lab_packages where slug = 'full-body-checkup';
  code := 'HH-' || upper(substr(md5(random()::text), 1, 6));
  insert into lab_bookings (owner_id, member_ids, package_id, address, address_label, starts_at, total_inr, payment, booking_code)
  values (uid, array[v_self, v_priya], v_pkg, '#42, 5th Cross, HAL 2nd Stage, Indiranagar, Bengaluru 560038',
          'Home, Indiranagar', ((today + 4) + time '07:00') at time zone ist, 2598, 'upi', code);

  return jsonb_build_object(
    'members', 3,
    'records', (select count(*) from records where owner_id = uid),
    'reminders', (select count(*) from reminders where owner_id = uid),
    'appointments', (select count(*) from appointments where owner_id = uid),
    'lab_bookings', (select count(*) from lab_bookings where owner_id = uid)
  );
end;
$$;

revoke execute on function public.seed_sample_family() from public, anon;
grant execute on function public.seed_sample_family() to authenticated;
