-- =====================================================================
-- QueLess · seed data (Pune demo)
-- Demo logins (password for all: Queless@123) are at the end of this file.
-- =====================================================================
set search_path = public, extensions;

-- ---------------- Categories ----------------
insert into public.categories (id, slug, name, icon, sort_order) values
  (1, 'healthcare',  'Healthcare',                '🏥', 1),
  (2, 'banking',     'Banking & Finance',         '🏦', 2),
  (3, 'restaurants', 'Restaurants & Hospitality', '🍽️', 3),
  (4, 'salons',      'Salons & Wellness',         '💇', 4),
  (5, 'retail',      'Retail & Service Centers',  '🛠️', 5),
  (6, 'government',  'Government Offices',        '🏛️', 6)
on conflict (id) do nothing;
select setval('public.categories_id_seq', 6);

-- ---------------- Need keywords (powers "ear pain" → ENT) ----------------
insert into public.need_keywords (keyword, category_id, service_tag) values
  ('ear pain', 1, 'ENT'), ('ear infection', 1, 'ENT'), ('hearing', 1, 'ENT'),
  ('sore throat', 1, 'ENT'), ('sinus', 1, 'ENT'), ('nose bleed', 1, 'ENT'),
  ('tooth pain', 1, 'Dental'), ('toothache', 1, 'Dental'), ('cavity', 1, 'Dental'), ('braces', 1, 'Dental'),
  ('fever', 1, 'General Physician'), ('cold', 1, 'General Physician'), ('cough', 1, 'General Physician'),
  ('blood test', 1, 'Pathology'), ('sugar test', 1, 'Pathology'),
  ('eye checkup', 1, 'Eye'), ('blurry vision', 1, 'Eye'),
  ('home loan', 2, 'Mortgage'), ('house loan', 2, 'Mortgage'),
  ('open account', 2, 'Accounts'), ('new account', 2, 'Accounts'), ('passbook', 2, 'Accounts'), ('kyc update', 2, 'Accounts'),
  ('cash deposit', 2, 'Cash'), ('withdraw cash', 2, 'Cash'),
  ('personal loan', 2, 'Loans'), ('gold loan', 2, 'Loans'), ('credit card', 2, 'Cards'),
  ('dinner', 3, 'Dine-in'), ('lunch', 3, 'Dine-in'), ('table', 3, 'Dine-in'), ('parcel', 3, 'Takeaway'), ('takeaway', 3, 'Takeaway'),
  ('haircut', 4, 'Haircut'), ('beard', 4, 'Haircut'), ('massage', 4, 'Spa'), ('spa', 4, 'Spa'), ('facial', 4, 'Spa'),
  ('phone repair', 5, 'Mobile Repair'), ('screen broken', 5, 'Mobile Repair'), ('battery', 5, 'Mobile Repair'),
  ('aadhaar', 6, 'Aadhaar'), ('aadhaar update', 6, 'Aadhaar'), ('address change', 6, 'Aadhaar'),
  ('driving licence', 6, 'RTO'), ('learner licence', 6, 'RTO'), ('vehicle registration', 6, 'RTO')
on conflict do nothing;

-- ---------------- Pune pincodes ----------------
insert into public.pincodes (pincode, area, lat, lng) values
  ('411001', 'Pune Camp',        18.5158, 73.8777),
  ('411002', 'Budhwar Peth',     18.5158, 73.8568),
  ('411004', 'Deccan Gymkhana',  18.5167, 73.8406),
  ('411005', 'Shivajinagar',     18.5308, 73.8475),
  ('411006', 'Yerawada',         18.5537, 73.8860),
  ('411007', 'Aundh',            18.5590, 73.8078),
  ('411008', 'Pashan',           18.5378, 73.7954),
  ('411009', 'Parvati',          18.4966, 73.8567),
  ('411011', 'Kasba Peth',       18.5195, 73.8599),
  ('411013', 'Hadapsar',         18.5089, 73.9260),
  ('411014', 'Viman Nagar',      18.5679, 73.9143),
  ('411015', 'Vishrantwadi',     18.5760, 73.8780),
  ('411016', 'Model Colony',     18.5314, 73.8339),
  ('411017', 'Pimpri',           18.6298, 73.7997),
  ('411019', 'Chinchwad',        18.6440, 73.7925),
  ('411021', 'Bavdhan',          18.5100, 73.7800),
  ('411027', 'Sangvi',           18.5793, 73.8150),
  ('411030', 'Sadashiv Peth',    18.5100, 73.8470),
  ('411036', 'Mundhwa',          18.5330, 73.9290),
  ('411037', 'Market Yard',      18.4880, 73.8660),
  ('411038', 'Kothrud',          18.5074, 73.8077),
  ('411040', 'Wanowrie',         18.4880, 73.9000),
  ('411041', 'Dhayari',          18.4450, 73.8100),
  ('411043', 'Dhankawadi',       18.4600, 73.8520),
  ('411044', 'Nigdi',            18.6510, 73.7700),
  ('411045', 'Baner',            18.5590, 73.7868),
  ('411046', 'Katraj',           18.4480, 73.8580),
  ('411048', 'Kondhwa',          18.4700, 73.8900),
  ('411051', 'Anand Nagar',      18.4800, 73.8200),
  ('411052', 'Karve Nagar',      18.4900, 73.8150),
  ('411057', 'Wakad',            18.5990, 73.7620),
  ('411058', 'Warje',            18.4800, 73.8000),
  ('411060', 'Undri',            18.4550, 73.9100),
  ('411061', 'Pimple Saudagar',  18.5970, 73.7970),
  ('411062', 'Chikhali',         18.6750, 73.8100)
on conflict (pincode) do nothing;

-- ---------------- Demo businesses ----------------
-- temp helper: weekly hours
create or replace function pg_temp.hours(o text, c text, sunday boolean default false) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'mon', jsonb_build_array(o, c), 'tue', jsonb_build_array(o, c), 'wed', jsonb_build_array(o, c),
    'thu', jsonb_build_array(o, c), 'fri', jsonb_build_array(o, c), 'sat', jsonb_build_array(o, c),
    'sun', case when sunday then jsonb_build_array(o, c) else 'null'::jsonb end)
$$;
create or replace function pg_temp.pt(lat double precision, lng double precision) returns geography
language sql immutable as $$ select st_setsrid(st_makepoint(lng, lat), 4326)::geography $$;

insert into public.businesses (id, slug, name, category_id, description, address, pincode, phone, location, amenities, opening_hours, status) values
  ('b0000000-0000-4000-8000-000000000001', 'sahyadri-ent-kothrud',   'Sahyadri ENT Clinic',            1, 'Ear, nose & throat specialists. Hearing tests and minor procedures.', 'Paud Road, near Kothrud Depot', '411038', '020-25430001', pg_temp.pt(18.5074, 73.8077), '{"wheelchair":true,"parking":true}',  pg_temp.hours('09:00','21:00'), 'approved'),
  ('b0000000-0000-4000-8000-000000000002', 'karve-hearing-ent',      'Karve Road Hearing & ENT Centre',1, 'Quick ENT consults and audiometry.',                                   'Karve Road, Karve Nagar',       '411052', '020-25430002', pg_temp.pt(18.4935, 73.8165), '{"wheelchair":true,"parking":false}', pg_temp.hours('08:00','22:00', true), 'approved'),
  ('b0000000-0000-4000-8000-000000000003', 'deccan-dental-studio',   'Deccan Dental Studio',           1, 'Painless dentistry, braces and cleaning.',                              'FC Road, Deccan Gymkhana',      '411004', '020-25430003', pg_temp.pt(18.5167, 73.8406), '{"wheelchair":false,"parking":true}', pg_temp.hours('10:00','20:00'), 'approved'),
  ('b0000000-0000-4000-8000-000000000004', 'aundh-family-clinic',    'Aundh Family Clinic & Lab',      1, 'General physician and a walk-in pathology lab.',                       'ITI Road, Aundh',               '411007', '020-25430004', pg_temp.pt(18.5590, 73.8078), '{"wheelchair":true,"parking":true}',  pg_temp.hours('07:00','21:00', true), 'approved'),
  ('b0000000-0000-4000-8000-000000000005', 'sbi-kothrud',            'State Bank of India, Kothrud',   2, 'Accounts, cash and home-loan desk.',                                   'Karve Road, Kothrud',           '411038', '020-25430005', pg_temp.pt(18.5050, 73.8150), '{"wheelchair":true,"parking":false}', pg_temp.hours('10:00','16:00'), 'approved'),
  ('b0000000-0000-4000-8000-000000000006', 'hdfc-baner',             'HDFC Bank, Baner',               2, 'Accounts and loans.',                                                  'Baner Road, Baner',             '411045', '020-25430006', pg_temp.pt(18.5590, 73.7868), '{"wheelchair":true,"parking":true}',  pg_temp.hours('09:30','17:30'), 'approved'),
  ('b0000000-0000-4000-8000-000000000007', 'vaishali-fc-road',       'Vaishali Restaurant',            3, 'Iconic FC Road South Indian café. Dine-in waitlist and parcels.',      'FC Road, Shivajinagar',         '411004', '020-25430007', pg_temp.pt(18.5211, 73.8411), '{"wheelchair":false,"parking":false}',pg_temp.hours('07:00','23:00', true), 'approved'),
  ('b0000000-0000-4000-8000-000000000008', 'looks-salon-kothrud',    'Looks Salon',                    4, 'Haircuts, grooming and spa.',                                          'Mayur Colony, Kothrud',         '411038', '020-25430008', pg_temp.pt(18.5040, 73.8120), '{"wheelchair":true,"parking":true}',  pg_temp.hours('10:00','21:00', true), 'approved'),
  ('b0000000-0000-4000-8000-000000000009', 'bliss-spa-viman-nagar',  'Bliss Spa & Wellness',           4, 'Massage, facials and relaxation.',                                     'Viman Nagar Road',              '411014', '020-25430009', pg_temp.pt(18.5679, 73.9143), '{"wheelchair":false,"parking":true}', pg_temp.hours('10:00','22:00', true), 'approved'),
  ('b0000000-0000-4000-8000-000000000010', 'ifix-shivajinagar',      'iFix Mobile Service Center',     5, 'Screen, battery and board repairs for all brands.',                   'JM Road, Shivajinagar',         '411005', '020-25430010', pg_temp.pt(18.5308, 73.8475), '{"wheelchair":true,"parking":false}', pg_temp.hours('10:00','20:00'), 'approved'),
  ('b0000000-0000-4000-8000-000000000011', 'aadhaar-seva-kothrud',   'Aadhaar Seva Kendra, Kothrud',   6, 'Enrolment, biometric and address updates.',                            'Kothrud Ward Office',           '411038', '1947',         pg_temp.pt(18.5060, 73.8050), '{"wheelchair":true,"parking":true}',  pg_temp.hours('09:30','17:30'), 'approved'),
  ('b0000000-0000-4000-8000-000000000012', 'rto-pune-sangam',        'RTO Pune (Sangam Bridge)',       6, 'Driving licences and vehicle registration.',                           'Sangam Bridge, Shivajinagar',   '411005', '020-25430012', pg_temp.pt(18.5290, 73.8560), '{"wheelchair":true,"parking":true}',  pg_temp.hours('10:00','17:00'), 'approved')
on conflict (id) do nothing;

-- ---------------- Services ----------------
insert into public.services (id, business_id, name, tags, default_service_sec) values
  ('50000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'ENT Consultation',      '{ENT,ear,nose,throat}', 420),
  ('50000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'ENT Consultation',      '{ENT,ear,hearing}',     360),
  ('50000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', 'Dental Checkup',        '{Dental,teeth}',        600),
  ('50000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000004', 'General Physician',     '{General Physician,fever}', 360),
  ('50000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000004', 'Blood Test Collection', '{Pathology,blood}',     180),
  ('50000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000005', 'Accounts & KYC',        '{Accounts,passbook}',   300),
  ('50000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000005', 'Cash Counter',          '{Cash,deposit}',        120),
  ('50000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000005', 'Home Loan Desk',        '{Mortgage,loan}',       900),
  ('50000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000006', 'Accounts',              '{Accounts}',            300),
  ('50000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000006', 'Loans',                 '{Loans,Mortgage}',      900),
  ('50000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000007', 'Dine-in Table',         '{Dine-in}',             900),
  ('50000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000007', 'Parcel / Takeaway',     '{Takeaway}',            180),
  ('50000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000008', 'Haircut & Styling',     '{Haircut,beard}',       1200),
  ('50000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000009', 'Spa & Massage',         '{Spa,massage}',         2400),
  ('50000000-0000-4000-8000-000000000015', 'b0000000-0000-4000-8000-000000000010', 'Mobile Repair',         '{Mobile Repair,screen}',900),
  ('50000000-0000-4000-8000-000000000016', 'b0000000-0000-4000-8000-000000000011', 'Aadhaar Update',        '{Aadhaar,biometric}',   600),
  ('50000000-0000-4000-8000-000000000017', 'b0000000-0000-4000-8000-000000000012', 'Driving Licence',       '{RTO,licence}',         600)
on conflict (id) do nothing;

-- ---------------- Queues (open for the demo) ----------------
insert into public.queues (id, business_id, service_id, name, token_prefix, status, daily_capacity, grace_sec, is_express, prerequisites) values
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'ENT OPD', 'E', 'open', 200, 300, false,
     '[{"id":"id_proof","label":"Government photo ID (Aadhaar / PAN)","required":true},{"id":"old_reports","label":"Previous prescriptions or reports","required":true},{"id":"insurance","label":"Insurance card (only if claiming)","required":false}]'),
  ('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'ENT Walk-in', 'H', 'open', 150, 300, false,
     '[{"id":"id_proof","label":"Government photo ID","required":true}]'),
  ('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', 'Dental OPD', 'D', 'open', 80, 300, false, '[]'),
  ('a0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', 'Doctor Consult', 'G', 'open', 150, 300, false, '[]'),
  ('a0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000005', 'Sample Collection', 'P', 'open', 200, 180, true,
     '[{"id":"fasting","label":"I have been fasting for 8+ hours (for sugar tests)","required":false},{"id":"prescription","label":"Doctor''s test prescription","required":true}]'),
  ('a0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000006', 'Accounts & KYC', 'A', 'open', 150, 300, false,
     '[{"id":"aadhaar","label":"Aadhaar card","required":true},{"id":"pan","label":"PAN card","required":true},{"id":"photo","label":"2 passport photos","required":false}]'),
  ('a0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000007', 'Cash Express', 'C', 'open', 300, 180, true, '[]'),
  ('a0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000008', 'Home Loan Desk', 'M', 'open', 40, 300, false,
     '[{"id":"salary","label":"Last 3 salary slips","required":true},{"id":"itr","label":"ITR of last 2 years","required":true},{"id":"property","label":"Property papers","required":false}]'),
  ('a0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-000000000009', 'Accounts', 'A', 'open', 150, 300, false, '[]'),
  ('a0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-000000000010', 'Loans', 'L', 'open', 60, 300, false, '[]'),
  ('a0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-000000000011', 'Table Waitlist', 'T', 'open', 300, 240, false, '[]'),
  ('a0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-000000000012', 'Parcel Counter', 'K', 'open', 400, 180, true, '[]'),
  ('a0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000008', '50000000-0000-4000-8000-000000000013', 'Hair Studio', 'S', 'open', 60, 300, false, '[]'),
  ('a0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000014', 'Spa Walk-in', 'W', 'open', 30, 300, false, '[]'),
  ('a0000000-0000-4000-8000-000000000015', 'b0000000-0000-4000-8000-000000000010', '50000000-0000-4000-8000-000000000015', 'Repair Desk', 'R', 'open', 100, 300, false,
     '[{"id":"invoice","label":"Purchase invoice (for warranty)","required":false},{"id":"backup","label":"I have backed up my phone data","required":true}]'),
  ('a0000000-0000-4000-8000-000000000016', 'b0000000-0000-4000-8000-000000000011', '50000000-0000-4000-8000-000000000016', 'Aadhaar Update', 'U', 'open', 120, 300, false,
     '[{"id":"aadhaar","label":"Original Aadhaar card","required":true},{"id":"address_proof","label":"Proof of new address","required":true}]'),
  ('a0000000-0000-4000-8000-000000000017', 'b0000000-0000-4000-8000-000000000012', '50000000-0000-4000-8000-000000000017', 'Licence Counter', 'V', 'open', 200, 300, false,
     '[{"id":"appointment","label":"Online appointment slip","required":true},{"id":"id_proof","label":"Age & address proof","required":true}]')
on conflict (id) do nothing;

-- ---------------- Counters ----------------
insert into public.counters (id, business_id, name) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Counter 1'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Counter 2'),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'Room 1'),
  ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000003', 'Chair 1'),
  ('c0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000004', 'Cabin 1'),
  ('c0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000004', 'Lab Desk'),
  ('c0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000005', 'Counter 1'),
  ('c0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000005', 'Cash 1'),
  ('c0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000005', 'Loan Desk'),
  ('c0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000006', 'Desk 1'),
  ('c0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000007', 'Host Stand'),
  ('c0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000008', 'Stylist 1'),
  ('c0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000009', 'Therapist 1'),
  ('c0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000010', 'Repair Desk'),
  ('c0000000-0000-4000-8000-000000000015', 'b0000000-0000-4000-8000-000000000011', 'Window 1'),
  ('c0000000-0000-4000-8000-000000000016', 'b0000000-0000-4000-8000-000000000012', 'Window A')
on conflict (id) do nothing;

insert into public.counter_queues (counter_id, queue_id) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002'),
  ('c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000003'),
  ('c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000004'),
  ('c0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000005'),
  ('c0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000006'),
  ('c0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000007'),
  ('c0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000008'),
  ('c0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000009'),
  ('c0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000010'),
  ('c0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000011'),
  ('c0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000012'),
  ('c0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000013'),
  ('c0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000014'),
  ('c0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000015'),
  ('c0000000-0000-4000-8000-000000000015', 'a0000000-0000-4000-8000-000000000016'),
  ('c0000000-0000-4000-8000-000000000016', 'a0000000-0000-4000-8000-000000000017')
on conflict do nothing;

-- ---------------- Demo crowd (so the ENT clinic shows RED) ----------------
select public.join_queue('a0000000-0000-4000-8000-000000000001', null, 'Walk-in ' || g, null, 'kiosk', '["id_proof","old_reports"]'::jsonb, '{}'::jsonb)
  from generate_series(1, 11) g;
select public.join_queue('a0000000-0000-4000-8000-000000000006', null, 'Walk-in ' || g, null, 'kiosk', '["aadhaar","pan"]'::jsonb, '{}'::jsonb)
  from generate_series(1, 5) g;
select public.join_queue('a0000000-0000-4000-8000-000000000011', null, 'Walk-in ' || g, null, 'kiosk', '[]'::jsonb, '{"party_size":2}'::jsonb)
  from generate_series(1, 7) g;
select public.join_queue('a0000000-0000-4000-8000-000000000002', null, 'Walk-in 1', null, 'kiosk', '["id_proof"]'::jsonb, '{}'::jsonb);

-- ---------------- Demo users (bcrypt hashes made by pgcrypto) ----------------
insert into public.users (id, email, password_hash, full_name, role) values
  ('d0000000-0000-4000-8000-000000000001', 'customer@queless.dev', crypt('Queless@123', gen_salt('bf', 10)), 'Riya Customer',       'customer'),
  ('d0000000-0000-4000-8000-000000000002', 'manager@queless.dev',  crypt('Queless@123', gen_salt('bf', 10)), 'Dr. Mehta (Manager)', 'business'),
  ('d0000000-0000-4000-8000-000000000003', 'staff@queless.dev',    crypt('Queless@123', gen_salt('bf', 10)), 'Amit (Staff)',        'business'),
  ('d0000000-0000-4000-8000-000000000004', 'admin@queless.dev',    crypt('Queless@123', gen_salt('bf', 10)), 'Platform Admin',      'admin')
on conflict do nothing;

update public.businesses set owner_id = 'd0000000-0000-4000-8000-000000000002'
 where id = 'b0000000-0000-4000-8000-000000000001';
insert into public.business_members (business_id, user_id, role) values
  ('b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'manager'),
  ('b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'staff')
on conflict do nothing;
