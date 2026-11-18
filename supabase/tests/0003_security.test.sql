-- 0003_security.test.sql
-- Proves the three Important fixes as real user roles (not postgres):
--   * the SECURITY DEFINER region trigger updates unsafe_regions through RLS
--   * nearby_responders is no longer callable by an end user (42501)
--   * the guardian read path works with no RLS recursion, and leaks no other journeys
-- pgTAP functions live in the extensions schema on hosted; search_path includes it,
-- so plan/is/throws_ok/finish are called unqualified.
-- plan is 5: the four review checks, plus the mandated separate report_count=1 assert.
begin;
select plan(5);

-- Two auth users: aa (journey owner / reporter), bb (guardian).
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','aa@test.local','x', now(),
   '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000bb','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','bb@test.local','x', now(),
   '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now());

insert into profiles (id, name) values
  ('00000000-0000-0000-0000-0000000000aa','Owner AA'),
  ('00000000-0000-0000-0000-0000000000bb','Guardian BB');

-- Guardian fixture (as postgres): a shared journey owned by aa, a contact owned by aa
-- linked to bb, an active monitoring_assignment, plus a second journey bb must NOT see.
insert into journeys
  (id, owner_id, from_label, to_label, from_geo, to_geo, start_at, mode,
   are_you_safe_word_hash, selfie_url, consent_version)
values
  ('00000000-0000-0000-0000-00000000ff01','00000000-0000-0000-0000-0000000000aa','A','B',
   st_setsrid(st_makepoint(77.2,28.6),4326)::geography,
   st_setsrid(st_makepoint(77.3,28.7),4326)::geography,
   now(), 'walk', 'h', 's', '2026-09-03-draft1'),
  ('00000000-0000-0000-0000-00000000ff02','00000000-0000-0000-0000-0000000000aa','A2','B2',
   st_setsrid(st_makepoint(77.2,28.6),4326)::geography,
   st_setsrid(st_makepoint(77.3,28.7),4326)::geography,
   now(), 'walk', 'h', 's', '2026-09-03-draft1');

insert into contacts (id, owner_id, name, phone, linked_user_id)
values ('00000000-0000-0000-0000-00000000fc01','00000000-0000-0000-0000-0000000000aa','C','+100',
        '00000000-0000-0000-0000-0000000000bb');

insert into monitoring_assignments (journey_id, contact_id, active)
values ('00000000-0000-0000-0000-00000000ff01','00000000-0000-0000-0000-00000000fc01', true);

-- ============ Test 1: definer trigger updates unsafe_regions through RLS ============
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);

insert into unsafe_regions (id, centroid, radius_m, status)
values ('00000000-0000-0000-0000-0000000000c1',
        st_setsrid(st_makepoint(72.87,19.07),4326)::geography, 200, 'amber');

-- first report as authenticated aa must not error and must bump report_count to 1
insert into unsafe_reports (region_id, reporter_id, reason)
values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000aa','harassment');
select is(
  (select report_count from unsafe_regions where id='00000000-0000-0000-0000-0000000000c1'),
  1,
  'definer trigger bumps report_count to 1 on an authenticated insert (updates through RLS)');

-- five more distinct reporters (as postgres) -> 6 distinct -> red, count 6
reset role;
insert into unsafe_reports (region_id, reporter_id, reason)
select '00000000-0000-0000-0000-0000000000c1', gen_random_uuid(), 'stalking'
from generate_series(1,5);
select is(
  (select status::text || ':' || report_count::text
     from unsafe_regions where id='00000000-0000-0000-0000-0000000000c1'),
  'red:6',
  'region flips to red with report_count 6 after 6 distinct reporters');

-- ============ Test 2: nearby_responders is not callable by an end user ============
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000bb', true);

select throws_ok(
  $$ select * from nearby_responders('00000000-0000-0000-0000-00000000ff01', 100) $$,
  '42501',
  'permission denied for function nearby_responders',
  'nearby_responders is not callable by end users');

-- ============ Test 3: guardian reads the shared journey (no RLS recursion) ============
select is(
  (select count(*) from journeys where id = '00000000-0000-0000-0000-00000000ff01'),
  1::bigint,
  'guardian can read the shared journey (no RLS recursion)');

-- ============ Test 4: guardian sees no other journeys ============
select is(
  (select count(*) from journeys
     where owner_id = '00000000-0000-0000-0000-0000000000aa'
       and id <> '00000000-0000-0000-0000-00000000ff01'),
  0::bigint,
  'guardian sees no other journeys');

reset role;
select * from finish();
rollback;
