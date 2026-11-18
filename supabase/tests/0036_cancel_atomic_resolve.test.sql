-- Fix lane F1 (founder 2026-11-12): cancel_resolve_and_move closes the cancel request row and
-- moves the alarm state in ONE step. T1-T7 as agreed by the founder.
-- WRITTEN by the lane, NOT run (no database access in the lane); run it after 0036 is applied
-- on the real DB. T4/T6 cannot show true concurrency inside one pgTAP transaction: they show
-- "the second call after the first returns claimed=false" and the one-switch-off count. Real
-- concurrency is guaranteed by the single conditional UPDATE (row lock), not by this test.
begin;
set local role postgres;
select plan(27);

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000f1001') on conflict do nothing;
insert into profiles (id) values ('00000000-0000-0000-0000-0000000f1001') on conflict do nothing;

-- Helper columns kept identical across the seven journeys; only id and the live state differ.
insert into journeys (id, owner_id, from_label, to_label, from_geo, to_geo, start_at, eta_seconds, mode, are_you_safe_word_hash, selfie_url, status, consent_version) values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000f1001', 'a', 'b', 'SRID=4326;POINT(77.2 28.6)', 'SRID=4326;POINT(77.3 28.7)', now(), 1800, 'cab', 'h', 'u', 'monitoring', 'v1'),
  ('00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-0000000f1001', 'a', 'b', 'SRID=4326;POINT(77.2 28.6)', 'SRID=4326;POINT(77.3 28.7)', now(), 1800, 'cab', 'h', 'u', 'monitoring', 'v1'),
  ('00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-0000000f1001', 'a', 'b', 'SRID=4326;POINT(77.2 28.6)', 'SRID=4326;POINT(77.3 28.7)', now(), 1800, 'cab', 'h', 'u', 'monitoring', 'v1'),
  ('00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-0000000f1001', 'a', 'b', 'SRID=4326;POINT(77.2 28.6)', 'SRID=4326;POINT(77.3 28.7)', now(), 1800, 'cab', 'h', 'u', 'monitoring', 'v1'),
  ('00000000-0000-0000-0000-00000000f105', '00000000-0000-0000-0000-0000000f1001', 'a', 'b', 'SRID=4326;POINT(77.2 28.6)', 'SRID=4326;POINT(77.3 28.7)', now(), 1800, 'cab', 'h', 'u', 'monitoring', 'v1'),
  ('00000000-0000-0000-0000-00000000f106', '00000000-0000-0000-0000-0000000f1001', 'a', 'b', 'SRID=4326;POINT(77.2 28.6)', 'SRID=4326;POINT(77.3 28.7)', now(), 1800, 'cab', 'h', 'u', 'monitoring', 'v1'),
  ('00000000-0000-0000-0000-00000000f107', '00000000-0000-0000-0000-0000000f1001', 'a', 'b', 'SRID=4326;POINT(77.2 28.6)', 'SRID=4326;POINT(77.3 28.7)', now(), 1800, 'cab', 'h', 'u', 'monitoring', 'v1');

-- live state per journey: f101-f106 CRITICAL (alarm on), f107 already ended.
insert into journey_state (journey_id, state, changed_by) values
  ('00000000-0000-0000-0000-00000000f101', 'CRITICAL', 'test'),
  ('00000000-0000-0000-0000-00000000f102', 'CRITICAL', 'test'),
  ('00000000-0000-0000-0000-00000000f103', 'CRITICAL', 'test'),
  ('00000000-0000-0000-0000-00000000f104', 'CRITICAL', 'test'),
  ('00000000-0000-0000-0000-00000000f105', 'CRITICAL', 'test'),
  ('00000000-0000-0000-0000-00000000f106', 'CRITICAL', 'test'),
  ('00000000-0000-0000-0000-00000000f107', 'RESOLVED_MONITORING', 'test');

insert into cancel_requests (id, journey_id, owner_id, method, asked_contact_ids, created_at, resolved_at, verdict) values
  -- T1: one open question
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000f1001', 'word', '{}', now() - interval '3 minutes', null, null),
  -- T2: two open questions (a later resend)
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-0000000f1001', 'word', '{}', now() - interval '40 minutes', null, null),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-0000000f1001', 'word', '{}', now() - interval '10 minutes', null, null),
  -- T3: emergency word first -> the row is distress + resolved
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-0000000f1001', 'word', '{}', now() - interval '5 minutes', now() - interval '4 minutes', 'distress'),
  -- T4: one open question, two Safes race
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-0000000f1001', 'word', '{}', now() - interval '3 minutes', null, null),
  -- T5: emergency-word alarm, guardian end
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-00000000f105', '00000000-0000-0000-0000-0000000f1001', 'word', '{}', now() - interval '10 minutes', now() - interval '9 minutes', 'distress'),
  -- T6: emergency-word alarm, two end actions race
  ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-00000000f106', '00000000-0000-0000-0000-0000000f1001', 'word', '{}', now() - interval '10 minutes', now() - interval '9 minutes', 'distress'),
  -- T7: alarm already ended, row already cancel
  ('00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-00000000f107', '00000000-0000-0000-0000-0000000f1001', 'word', '{}', now() - interval '20 minutes', now() - interval '18 minutes', 'cancel');

-- ---- T1: one open question, Safe at minute 3 -> answered AND alarm off, together ----
select is(
  (select claimed from public.cancel_resolve_and_move(
    '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000a1', 'open', true,
    'RESOLVED_MONITORING', 'guardian approved cancel', 'trustee', 'monitoring', false, true, null, null, 'siren')),
  true, 'T1 the Safe is counted (claimed)');
select is((select verdict from cancel_requests where id = '00000000-0000-0000-0000-0000000000a1'), 'cancel', 'T1 the question is answered');
select ok((select resolved_at from cancel_requests where id = '00000000-0000-0000-0000-0000000000a1') is not null, 'T1 the question is closed');
select is((select state from journey_state where journey_id = '00000000-0000-0000-0000-00000000f101' order by changed_at desc, id desc limit 1), 'RESOLVED_MONITORING', 'T1 the alarm is off, in the same step');
select is((select heightened from journeys where id = '00000000-0000-0000-0000-00000000f101'), true, 'T1 monitoring is heightened');

-- ---- T2: after minute 30, two open questions, Safe -> alarm off, all questions closed ----
select is(
  (select claimed from public.cancel_resolve_and_move(
    '00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-0000000000a3', 'open', true,
    'RESOLVED_MONITORING', 'guardian approved cancel', 'trustee', 'monitoring', false, true, null, null, 'siren')),
  true, 'T2 the Safe is counted');
select is((select verdict from cancel_requests where id = '00000000-0000-0000-0000-0000000000a3'), 'cancel', 'T2 the answered question is closed');
select is((select verdict from cancel_requests where id = '00000000-0000-0000-0000-0000000000a2'), 'cancel', 'T2 the other open question is also closed');
select ok((select count(*) from cancel_requests where journey_id = '00000000-0000-0000-0000-00000000f102' and resolved_at is null) = 0, 'T2 no question is left open');
select is((select state from journey_state where journey_id = '00000000-0000-0000-0000-00000000f102' order by changed_at desc, id desc limit 1), 'RESOLVED_MONITORING', 'T2 the alarm is off');

-- ---- T3: emergency word first (row distress), then normal Safe -> refused, alarm stays on ----
select is(
  (select claimed from public.cancel_resolve_and_move(
    '00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-0000000000a4', 'open', true,
    'RESOLVED_MONITORING', 'guardian approved cancel', 'trustee', 'monitoring', false, true, null, null, 'siren')),
  false, 'T3 the Safe is refused on a row the emergency word already closed');
select is((select verdict from cancel_requests where id = '00000000-0000-0000-0000-0000000000a4'), 'distress', 'T3 the row is untouched');
select is((select state from journey_state where journey_id = '00000000-0000-0000-0000-00000000f103' order by changed_at desc, id desc limit 1), 'CRITICAL', 'T3 the alarm stays on');

-- ---- T4: two Safes at the same moment -> only one counted, one switch-off ----
select is(
  (select claimed from public.cancel_resolve_and_move(
    '00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-0000000000a5', 'open', true,
    'RESOLVED_MONITORING', 'guardian approved cancel', 'trustee', 'monitoring', false, true, null, null, 'siren')),
  true, 'T4 the first Safe is counted');
select is(
  (select claimed from public.cancel_resolve_and_move(
    '00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-0000000000a5', 'open', true,
    'RESOLVED_MONITORING', 'guardian approved cancel', 'trustee', 'monitoring', false, true, null, null, 'siren')),
  false, 'T4 the second Safe (after the first) is not counted');
select ok((select count(*) from journey_state where journey_id = '00000000-0000-0000-0000-00000000f104' and state = 'RESOLVED_MONITORING') = 1, 'T4 the alarm is switched off exactly once (no duplicate email trigger)');

-- ---- T5: emergency-word alarm, guardian end action -> ended and marked in one step ----
select is(
  (select claimed from public.cancel_resolve_and_move(
    '00000000-0000-0000-0000-00000000f105', '00000000-0000-0000-0000-0000000000a6', 'distress', false,
    'RESOLVED_MONITORING', 'guardian approved cancel', 'trustee', 'monitoring', false, true, null, null, 'siren')),
  true, 'T5 the end action is counted');
select is((select verdict from cancel_requests where id = '00000000-0000-0000-0000-0000000000a6'), 'cancel', 'T5 the distress row is marked ended');
select is((select state from journey_state where journey_id = '00000000-0000-0000-0000-00000000f105' order by changed_at desc, id desc limit 1), 'RESOLVED_MONITORING', 'T5 the alarm is off, same step');
select is((select heightened from journeys where id = '00000000-0000-0000-0000-00000000f105'), true, 'T5 monitoring is heightened');

-- ---- T6: two end actions at the same moment -> only one counted ----
select is(
  (select claimed from public.cancel_resolve_and_move(
    '00000000-0000-0000-0000-00000000f106', '00000000-0000-0000-0000-0000000000a7', 'distress', false,
    'RESOLVED_MONITORING', 'guardian approved cancel', 'trustee', 'monitoring', false, true, null, null, 'siren')),
  true, 'T6 the first end action is counted');
select is(
  (select claimed from public.cancel_resolve_and_move(
    '00000000-0000-0000-0000-00000000f106', '00000000-0000-0000-0000-0000000000a7', 'distress', false,
    'RESOLVED_MONITORING', 'guardian approved cancel', 'trustee', 'monitoring', false, true, null, null, 'siren')),
  false, 'T6 the second end action (after the first) is not counted');
select ok((select count(*) from journey_state where journey_id = '00000000-0000-0000-0000-00000000f106' and state = 'RESOLVED_MONITORING') = 1, 'T6 the alarm is switched off exactly once');

-- ---- T7: alarm already ended before the tap -> nothing changes, "already decided" ----
select is(
  (select claimed from public.cancel_resolve_and_move(
    '00000000-0000-0000-0000-00000000f107', '00000000-0000-0000-0000-0000000000a8', 'distress', false,
    'RESOLVED_MONITORING', 'guardian approved cancel', 'trustee', 'monitoring', false, true, null, null, 'siren')),
  false, 'T7 the end action on an already-ended alarm is refused');
select is((select verdict from cancel_requests where id = '00000000-0000-0000-0000-0000000000a8'), 'cancel', 'T7 the row is unchanged');
select ok((select count(*) from journey_state where journey_id = '00000000-0000-0000-0000-00000000f107') = 1, 'T7 no new state row is written');

-- the route alone may run it: signed-in users cannot.
select ok(not has_function_privilege('authenticated', 'cancel_resolve_and_move(uuid, uuid, text, boolean, text, text, text, text, boolean, boolean, text, timestamptz, text)', 'execute'), 'signed-in users cannot call the function');

select * from finish();
rollback;
