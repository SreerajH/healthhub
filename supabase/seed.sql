-- Catalog seed: the same Bengaluru data the app shipped with as mock data.
-- Safe to re-run: every insert is idempotent.

insert into public.specialties (id, label, icon, keywords, sort_order) values
  ('gp',       'General physician', 'Stethoscope', 'fever cold cough infection bp checkup family doctor', 1),
  ('paeds',    'Paediatrics',       'Baby',        'child baby kids paediatrician pediatrician vaccine', 2),
  ('gynae',    'Gynaecology',       'Female',      'pregnancy periods pcos women gynecologist', 3),
  ('derm',     'Dermatology',       'Sun',         'skin acne hair rash eczema dermatologist', 4),
  ('cardio',   'Cardiology',        'Heart Pulse', 'heart chest pain bp cholesterol cardiologist', 5),
  ('ortho',    'Orthopaedics',      'Bone',        'bone joint knee back pain fracture orthopedic', 6),
  ('ent',      'ENT',               'Ear',         'ear nose throat sinus tonsils hearing', 7),
  ('dental',   'Dentistry',         'Tooth',       'teeth tooth dentist root canal', 8),
  ('eye',      'Eye care',          'Eye',         'eye vision glasses cataract ophthalmologist', 9),
  ('neuro',    'Neurology',         'Brain',       'headache migraine seizure nerve neurologist', 10),
  ('diabetes', 'Diabetes care',     'Droplet',     'diabetes sugar thyroid hormone endocrinologist', 11),
  ('mental',   'Mental health',     'Heart',       'anxiety stress depression sleep psychiatrist therapy', 12)
on conflict (id) do update set label = excluded.label, icon = excluded.icon, keywords = excluded.keywords, sort_order = excluded.sort_order;

insert into public.doctors (
  full_name, initials, specialty_id, specialty_label, gender, qualifications, college, experience_years,
  languages, fee_inr, rating, review_count, patients, clinic_name, clinic_area, clinic_address, lat, lng, reg_no, about, verified
) values
  ('Dr. Ananya Rao','AR','paeds','Paediatrician','female','MBBS, MD (Paediatrics)','St. John''s Medical College',12,array['English','Hindi','Kannada'],600,4.8,312,3200,'Rainbow Children''s Clinic','Indiranagar','12, 80 Feet Road, Indiranagar, Bengaluru 560038',12.9719,77.6412,'Karnataka Medical Council reg. 54321','Child health from newborn care to teens: vaccines, growth checks, fevers, allergies and asthma. Calm with first-time parents.',true),
  ('Dr. Sameer Kulkarni','SK','paeds','Paediatrician','male','MBBS, DCH','BJ Medical College, Pune',9,array['English','Hindi','Marathi'],500,4.7,198,2100,'Little Steps Clinic','Koramangala','3rd Main, Koramangala 5th Block, Bengaluru 560095',12.9345,77.6266,'Karnataka Medical Council reg. 61877','Everyday childhood illnesses, vaccinations and nutrition advice, with evening hours for working parents.',true),
  ('Dr. Lakshmi Narayan','LN','paeds','Paediatrician','female','MBBS, MD, Fellowship in Neonatology','Madras Medical College',20,array['English','Kannada','Tamil'],900,4.9,640,8000,'Cloudnine, Old Airport Road','Old Airport Road','Old Airport Road, Bengaluru 560017',12.9592,77.6974,'Karnataka Medical Council reg. 32190','Newborn and premature baby care, developmental checks and complex childhood conditions.',true),
  ('Dr. Meera Iyer','MI','diabetes','Endocrinologist','female','MBBS, MD, DM (Endocrinology)','AIIMS, New Delhi',15,array['English','Tamil','Kannada'],800,4.9,486,5400,'Manipal Hospital, Old Airport Road','Old Airport Road','98, HAL Old Airport Road, Bengaluru 560017',12.9592,77.6514,'Karnataka Medical Council reg. 40112','Diabetes, thyroid and hormone conditions. Practical diet and medicine plans you can keep up with.',true),
  ('Dr. Vikram Shetty','VS','eye','Ophthalmologist','male','MBBS, MS (Ophthalmology)','Kasturba Medical College, Manipal',18,array['English','Kannada','Tulu'],700,4.8,402,6100,'Narayana Nethralaya, Rajajinagar','Rajajinagar','121/C, Chord Road, Rajajinagar, Bengaluru 560010',12.9916,77.5526,'Karnataka Medical Council reg. 28845','Cataract and glaucoma care, eye checks for diabetes, and glasses prescriptions for all ages.',true),
  ('Dr. Arjun Menon','AM','gp','General physician','male','MBBS, MD (Internal Medicine)','Government Medical College, Kozhikode',11,array['English','Hindi','Malayalam'],400,4.6,221,4300,'Apollo Clinic, Indiranagar','Indiranagar','100 Feet Road, Indiranagar, Bengaluru 560038',12.9784,77.6408,'Karnataka Medical Council reg. 57002','Fevers, infections, blood pressure, diabetes follow-ups and yearly health checks for adults.',true),
  ('Dr. Kavya Reddy','KR','gp','General physician','female','MBBS, DNB (Family Medicine)','Osmania Medical College',7,array['English','Telugu','Kannada','Hindi'],450,4.7,164,2600,'HealthFirst Family Clinic','Domlur','2nd Stage, Domlur Layout, Bengaluru 560071',12.9611,77.6387,'Karnataka Medical Council reg. 70315','Family doctor for all ages: coughs and colds, women''s health questions and long-term conditions.',true),
  ('Dr. Ritu Sharma','RS','gynae','Gynaecologist','female','MBBS, MS (Obstetrics & Gynaecology)','Lady Hardinge Medical College',16,array['English','Hindi','Punjabi'],900,4.9,538,7200,'Cloudnine, Old Airport Road','Old Airport Road','Old Airport Road, Bengaluru 560017',12.9592,77.6974,'Karnataka Medical Council reg. 36671','Pregnancy care, periods and PCOS, fertility questions and menopause, in a relaxed, private setting.',true),
  ('Dr. Shalini Hegde','SH','gynae','Gynaecologist','female','MBBS, DGO, DNB','Bangalore Medical College',10,array['English','Kannada','Konkani'],700,4.7,241,3100,'Motherhood Hospital, Indiranagar','Indiranagar','CMH Road, Indiranagar, Bengaluru 560038',12.9779,77.6408,'Karnataka Medical Council reg. 62240','Antenatal check-ups, contraception advice and routine women''s health screening.',true),
  ('Dr. Nisha Kapoor','NK','derm','Dermatologist','female','MBBS, MD (Dermatology)','Maulana Azad Medical College',8,array['English','Hindi'],750,4.6,189,2400,'Skin & Hair Clinic, Indiranagar','Indiranagar','12th Main, HAL 2nd Stage, Bengaluru 560008',12.9718,77.6412,'Karnataka Medical Council reg. 66408','Acne, eczema, hair fall and skin allergies, with treatments that fit your skin and budget.',true),
  ('Dr. Rajesh Pillai','RP','cardio','Cardiologist','male','MBBS, MD, DM (Cardiology)','Sree Chitra Tirunal Institute',22,array['English','Malayalam','Hindi'],1000,4.9,712,9800,'Manipal Hospital, Old Airport Road','Old Airport Road','98, HAL Old Airport Road, Bengaluru 560017',12.9592,77.6514,'Karnataka Medical Council reg. 21567','Heart checks, blood pressure, chest pain and cholesterol, with a focus on prevention.',true),
  ('Dr. Karthik Gowda','KG','ortho','Orthopaedic surgeon','male','MBBS, MS (Orthopaedics)','Mysore Medical College',14,array['English','Kannada'],800,4.7,305,4700,'Sakra World Hospital','Bellandur','Devarabeesanahalli, Bellandur, Bengaluru 560103',12.9299,77.6848,'Karnataka Medical Council reg. 45930','Knee and back pain, sports injuries, fractures and arthritis care.',true),
  ('Dr. Farah Siddiqui','FS','ent','ENT specialist','female','MBBS, MS (ENT)','Jawaharlal Nehru Medical College, Aligarh',11,array['English','Hindi','Urdu'],650,4.8,233,3500,'Aster CMI, Hebbal','Hebbal','43/2, New Airport Road, Hebbal, Bengaluru 560092',13.0487,77.5916,'Karnataka Medical Council reg. 58104','Ear infections, sinus problems, tonsils, hearing checks and snoring, for children and adults.',true),
  ('Dr. Rohan Desai','RD','dental','Dentist','male','BDS, MDS (Endodontics)','Manipal College of Dental Sciences',9,array['English','Hindi','Gujarati'],500,4.8,276,3900,'Smile Studio Dental','Indiranagar','100 Feet Road, Indiranagar, Bengaluru 560038',12.9784,77.6408,'Karnataka State Dental Council reg. A-11873','Check-ups and cleaning, fillings, root canals and gentle care for nervous patients.',true),
  ('Dr. Suresh Babu','SB','neuro','Neurologist','male','MBBS, MD, DM (Neurology)','NIMHANS, Bengaluru',19,array['English','Kannada','Telugu'],1000,4.8,354,5200,'Fortis Hospital, Cunningham Road','Cunningham Road','14, Cunningham Road, Bengaluru 560052',12.9887,77.5946,'Karnataka Medical Council reg. 30278','Headaches and migraines, seizures, numbness, memory concerns and stroke follow-up.',true),
  ('Dr. Aditi Joshi','AJ','mental','Psychiatrist','female','MBBS, MD (Psychiatry)','NIMHANS, Bengaluru',10,array['English','Hindi','Marathi'],1200,4.9,198,2300,'MindSpace Clinic','Koramangala','80 Feet Road, Koramangala 4th Block, Bengaluru 560034',12.9352,77.6245,'Karnataka Medical Council reg. 63390','Anxiety, low mood, sleep problems and stress. A safe, unhurried space to talk.',true)
on conflict do nothing;

insert into public.lab_packages (slug, kind, category, name, tests_note, description, tests, tests_count, report_hours, price_inr, mrp_inr, fasting_hours, home_collection, lab_name, min_age, max_age) values
  ('full-body-checkup','package','full','Full body checkup',null,'A yearly check of blood count, sugar, cholesterol, liver, kidney, thyroid and vitamins. By Lal PathLabs.',array['Complete blood count','Liver function','Kidney function','Thyroid profile','Lipid profile','Diabetes (HbA1c, fasting sugar)','Vitamins D and B12','Urine routine'],72,24,1299,2999,'10–12',true,'Lal PathLabs',18,null),
  ('diabetes-care','package','diabetes','Diabetes care',null,'Sugar control over 3 months, plus the kidney and cholesterol checks diabetes needs. By Lal PathLabs.',array['Diabetes (HbA1c, fasting sugar)','Kidney function','Lipid profile','Urine routine'],28,24,899,1999,'8–10',true,'Lal PathLabs',18,null),
  ('thyroid-profile','package','thyroid','Thyroid profile','(T3, T4, TSH)','Checks how well your thyroid is working. No fasting needed. By Thyrocare.',array['T3','T4','TSH'],3,12,499,999,null,true,'Thyrocare',null,null),
  ('senior-citizen','package','senior','Senior citizen checkup',null,'A fuller yearly check for 60+: heart, bones, vitamins, kidney, liver, sugar and thyroid. By Lal PathLabs.',array['Complete blood count','Liver function','Kidney function','Thyroid profile','Lipid profile','Diabetes (HbA1c, fasting sugar)','Vitamins D and B12','Iron studies','Urine routine'],86,48,1999,4499,'10–12',true,'Lal PathLabs',50,null),
  ('child-wellness','package','child','Child wellness',null,'Gentle checks for growing children: blood count, iron, vitamins and thyroid. Small samples only. By Thyrocare.',array['Complete blood count','Iron studies','Vitamins D and B12','Thyroid profile'],34,24,999,1999,null,true,'Thyrocare',1,14),
  ('cbc','test',null,'Complete blood count (CBC)',null,'Red and white cells, haemoglobin and platelets. A common first test for tiredness, fever or infection.',array['Haemoglobin','Total WBC count','Platelet count','RBC indices (MCV, MCH, MCHC)'],24,12,299,499,null,true,'Lal PathLabs',null,null),
  ('hba1c','test',null,'HbA1c',null,'Your average blood sugar over the last 3 months. No fasting needed.',array['Glycated haemoglobin'],1,12,399,699,null,true,'Thyrocare',null,null),
  ('lipid-profile','test',null,'Lipid profile',null,'Cholesterol and triglycerides, to check heart health.',array['Total cholesterol','HDL','LDL','Triglycerides'],8,12,449,899,'10–12',true,'Lal PathLabs',null,null),
  ('vitamin-d','test',null,'Vitamin D (25-OH)',null,'Low vitamin D is very common and can cause tiredness and aches.',array['25-hydroxy vitamin D'],1,24,799,1499,null,true,'Thyrocare',null,null),
  ('liver-function','test',null,'Liver function test',null,'Enzymes, bilirubin and proteins made by the liver.',array['SGOT (AST)','SGPT (ALT)','Bilirubin, total and direct','Albumin'],12,12,499,999,null,true,'Lal PathLabs',null,null),
  ('kidney-function','test',null,'Kidney function test',null,'Creatinine, urea and uric acid, to check how your kidneys filter blood.',array['Creatinine','Blood urea','Uric acid','eGFR'],8,12,549,999,null,true,'Lal PathLabs',null,null),
  ('urine-routine','test',null,'Urine routine',null,'Checks for infection, sugar and protein in urine.',array['Colour and appearance','pH and specific gravity','Protein and glucose','Microscopy'],12,12,199,399,null,true,'Thyrocare',null,null)
on conflict (slug) do nothing;

-- Slots: 14 days ahead, from each doctor's clinic sessions, with a stable scattering of booked ones.
-- Times are IST (Asia/Kolkata); doctors are closed on their days off.
with sessions as (
  select * from (values
    ('Dr. Ananya Rao',    array['12:30','14:00','14:30','15:00','16:30','17:00','17:30','18:00'], array[0]),
    ('Dr. Sameer Kulkarni', array['16:30','17:00','17:30','18:00'],                               array[0]),
    ('Dr. Lakshmi Narayan', array['09:00','09:30','10:00','10:30','11:00','11:30','16:30','17:00','17:30','18:00'], array[0,3]),
    ('Dr. Meera Iyer',    array['09:00','09:30','10:00','10:30','11:00','11:30'],                 array[0,2]),
    ('Dr. Vikram Shetty', array['09:00','09:30','10:00','10:30','11:00','11:30','12:30','14:00','14:30','15:00'], array[0,2]),
    ('Dr. Arjun Menon',   array['09:00','09:30','10:00','10:30','11:00','11:30','16:30','17:00','17:30','18:00'], array[0]),
    ('Dr. Kavya Reddy',   array['09:00','09:30','10:00','10:30','11:00','11:30','12:30','14:00','14:30','15:00'], array[0]),
    ('Dr. Ritu Sharma',   array['09:00','09:30','10:00','10:30','11:00','11:30','12:30','14:00','14:30','15:00'], array[0]),
    ('Dr. Shalini Hegde', array['16:30','17:00','17:30','18:00'],                                 array[0]),
    ('Dr. Nisha Kapoor',  array['12:30','14:00','14:30','15:00','16:30','17:00','17:30','18:00'], array[0]),
    ('Dr. Rajesh Pillai', array['09:00','09:30','10:00','10:30','11:00','11:30'],                 array[0,6]),
    ('Dr. Karthik Gowda', array['09:00','09:30','10:00','10:30','11:00','11:30','12:30','14:00','14:30','15:00'], array[0]),
    ('Dr. Farah Siddiqui',array['12:30','14:00','14:30','15:00','16:30','17:00','17:30','18:00'], array[0]),
    ('Dr. Rohan Desai',   array['09:00','09:30','10:00','10:30','11:00','11:30','12:30','14:00','14:30','15:00','16:30','17:00','17:30','18:00'], array[0]),
    ('Dr. Suresh Babu',   array['09:00','09:30','10:00','10:30','11:00','11:30'],                 array[0,4]),
    ('Dr. Aditi Joshi',   array['12:30','14:00','14:30','15:00','16:30','17:00','17:30','18:00'], array[0])
  ) as s(full_name, times, days_off)
),
days as (
  select (current_date at time zone 'Asia/Kolkata')::date + i as day
  from generate_series(0, 13) as i
)
insert into public.doctor_slots (doctor_id, starts_at, is_booked)
select
  d.id,
  ((day || ' ' || t) ::timestamp at time zone 'Asia/Kolkata') as starts_at,
  ('x' || substr(md5(d.id::text || day::text || t), 1, 8))::bit(32)::bigint % 4 = 0 as is_booked
from sessions s
join public.doctors d on d.full_name = s.full_name
cross join days
cross join unnest(s.times) as t
where not (extract(dow from day)::int = any (s.days_off))
  and ((day || ' ' || t)::timestamp at time zone 'Asia/Kolkata') > now() + interval '1 hour'
on conflict (doctor_id, starts_at) do nothing;
