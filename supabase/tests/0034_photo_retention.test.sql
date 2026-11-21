-- Fix lane D6 (founder Q127), D7 (Q133): photo_retention_candidates lists only trip photos and videos older
-- than the cut-off, never her profile photo, never a live alarm's photos.
-- Written by the lane, NOT run (no database access in the lane); run it after 0034 is applied.
begin;
set local role postgres;
select plan(16);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000d6001'), ('00000000-0000-0000-0000-0000000d6002') on conflict do nothing;
insert into profiles (id) values
  ('00000000-0000-0000-0000-0000000d6001'), ('00000000-0000-0000-0000-0000000d6002') on conflict do nothing;
-- d6001: a finished journey. d6002: a journey whose alarm is live (CRITICAL, monitoring).
insert into journeys (id, owner_id, from_label, to_label, from_geo, to_geo, start_at, eta_seconds, mode, are_you_safe_word_hash, selfie_url, status, consent_version) values
  ('00000000-0000-0000-0000-0000000d6a01', '00000000-0000-0000-0000-0000000d6001', 'a', 'b', 'SRID=4326;POINT(77.2 28.6)', 'SRID=4326;POINT(77.3 28.7)', now() - interval '40 days', 1800, 'cab', 'h', 'u', 'done', 'v1'),
  ('00000000-0000-0000-0000-0000000d6a02', '00000000-0000-0000-0000-0000000d6002', 'a', 'b', 'SRID=4326;POINT(77.2 28.6)', 'SRID=4326;POINT(77.3 28.7)', now() - interval '40 days', 1800, 'cab', 'h', 'u', 'monitoring', 'v1');
insert into journey_state (journey_id, state, changed_by) values
  ('00000000-0000-0000-0000-0000000d6a01', 'RESOLVED', 'test'),
  ('00000000-0000-0000-0000-0000000d6a02', 'CRITICAL', 'test');

insert into storage.objects (bucket_id, name, created_at) values
  ('frames',  '00000000-0000-0000-0000-0000000d6a01/1700000000000.jpg', now() - interval '31 days'),
  ('frames',  '00000000-0000-0000-0000-0000000d6a01/1800000000000.jpg', now() - interval '29 days'),
  ('frames',  '00000000-0000-0000-0000-0000000d6a02/1700000000000.jpg', now() - interval '31 days'),
  ('selfies', '00000000-0000-0000-0000-0000000d6001/1700000000000-ab12cd34.jpg', now() - interval '31 days'),
  ('selfies', '00000000-0000-0000-0000-0000000d6001/cancel/00000000-0000-0000-0000-0000000d6a01/00000000-0000-0000-0000-0000000d6c01.jpg', now() - interval '31 days'),
  ('selfies', '00000000-0000-0000-0000-0000000d6001/cancel/00000000-0000-0000-0000-0000000d6a01/00000000-0000-0000-0000-0000000d6c02.mp4', now() - interval '31 days'),
  ('selfies', '00000000-0000-0000-0000-0000000d6001/profile.jpg', now() - interval '400 days'),
  ('selfies', '00000000-0000-0000-0000-0000000d6002/1700000000000-ab12cd34.jpg', now() - interval '31 days'),
  ('selfies', '00000000-0000-0000-0000-0000000d6001/challenge-00000000-0000-0000-0000-0000000d6a01-1700000000000.jpg', now() - interval '31 days'),
  ('selfies', '00000000-0000-0000-0000-0000000d6001/challenge-00000000-0000-0000-0000-0000000d6a01-1800000000000.jpg', now() - interval '29 days'),
  ('selfies', 'simulation/00000000-0000-0000-0000-0000000d6001/00000000-0000-0000-0000-0000000d6e01.jpg', now() - interval '31 days'),
  ('selfies', 'simulation/00000000-0000-0000-0000-0000000d6001/00000000-0000-0000-0000-0000000d6e02.mp4', now() - interval '31 days'),
  ('selfies', 'simulation/00000000-0000-0000-0000-0000000d6002/00000000-0000-0000-0000-0000000d6e03.mp4', now() - interval '31 days'),
  ('selfies', '00000000-0000-0000-0000-0000000d6002/cancel/00000000-0000-0000-0000-0000000d6a02/00000000-0000-0000-0000-0000000d6c03.mp4', now() - interval '31 days'),
  ('recordings', '00000000-0000-0000-0000-0000000d6a01/clip.m4a', now() - interval '31 days');

create temp table c as select * from photo_retention_candidates(now() - interval '30 days', 1000);

select ok(exists (select 1 from c where name = '00000000-0000-0000-0000-0000000d6a01/1700000000000.jpg'), 'old alarm photo of a finished journey is listed');
select ok(not exists (select 1 from c where name = '00000000-0000-0000-0000-0000000d6a01/1800000000000.jpg'), '29-day photo is not listed');
select ok(not exists (select 1 from c where name = '00000000-0000-0000-0000-0000000d6a02/1700000000000.jpg'), 'live alarm photo is not listed');
select ok(exists (select 1 from c where name = '00000000-0000-0000-0000-0000000d6001/1700000000000-ab12cd34.jpg'), 'old journey selfie is listed');
select ok(exists (select 1 from c where name like '%/cancel/%d6c01.jpg'), 'old cancel proof photo is listed');
select ok(exists (select 1 from c where name like '%/cancel/%d6c02.mp4'), 'old cancel proof video is listed (D7, Q133)');
select ok(exists (select 1 from c where name like '%/challenge-%-1700000000000.jpg'), 'old check selfie is listed (D7)');
select ok(not exists (select 1 from c where name like '%/challenge-%-1800000000000.jpg'), '29-day check selfie is not listed');
select ok(exists (select 1 from c where name like 'simulation/%d6e01.jpg'), 'old practice proof photo is listed (D7)');
select ok(exists (select 1 from c where name like 'simulation/%d6e02.mp4'), 'old practice proof video is listed (D7)');
select ok(not exists (select 1 from c where name like 'simulation/00000000-0000-0000-0000-0000000d6002/%'), 'practice proof of an owner with a live alarm is not listed');
select ok(not exists (select 1 from c where name like '%d6c03.mp4'), 'cancel video of an owner with a live alarm is not listed');
select ok(not exists (select 1 from c where bucket_id = 'recordings'), 'recordings bucket is not listed');
select ok(not exists (select 1 from c where name like '%/profile.jpg'), 'profile photo is not listed');
select ok(not exists (select 1 from c where name like '00000000-0000-0000-0000-0000000d6002/%'), 'selfie of an owner with a live alarm is not listed');
select ok(not has_function_privilege('authenticated', 'photo_retention_candidates(timestamptz, int)', 'execute'), 'signed-in users cannot call it');

select * from finish();
rollback;
