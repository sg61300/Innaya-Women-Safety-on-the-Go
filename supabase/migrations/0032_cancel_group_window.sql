-- Fix AD round 2 (founder Q95, Q98, Q100, Q101): server retry clock for the guardian
-- cancel request. FILE ONLY: not applied by the lane.
-- One cancel_requests row = one 30-minute cycle for one group of up to 3 guardians.
--   group_index         which group of the owner's guardians this cycle asks
--   resent_at           the single resend inside the window has gone out
--   resend_pending_ids  who that resend has yet to reach; retried until empty
--   rolled_at           the clock no longer drives this row (window over, or group replaced)
--   phone_stage         the phone stopped after the correct word: 'first' = first group told,
--                       'all' = all guardians asked; the moving clock is paused on such a row
--   ask_pending_ids     who the first ask of this cycle has yet to reach; retried until empty
--   ask_retry_at        when that retry last went out
--   next_opened_at      the next cycle exists, so the clock need not read this row again
--   verdict 'distress'  closed by the emergency word while waiting; no Safe can end it
--
-- Before applying, on production, look at what is open:
--   select r.id, r.created_at, j.status from cancel_requests r join journeys j on j.id = r.journey_id where r.resolved_at is null;
alter table cancel_requests
  add column if not exists group_index int not null default 0,
  add column if not exists resent_at timestamptz,
  add column if not exists resend_pending_ids uuid[] not null default '{}',
  add column if not exists rolled_at timestamptz,
  add column if not exists phone_stage text check (phone_stage in ('first','all')),
  add column if not exists ask_pending_ids uuid[] not null default '{}',
  add column if not exists ask_retry_at timestamptz,
  add column if not exists next_opened_at timestamptz;

alter table cancel_requests drop constraint if exists cancel_requests_verdict_check;
alter table cancel_requests add constraint cancel_requests_verdict_check
  check (verdict in ('cancel','keep','reraise','pending','distress'));

-- Rows already open must not leave a journey stuck (fix lane R, M10a), so none is rolled:
--  1. Any journey not in monitoring (finished, expired), or a row older than the 24 h guardian
--     link: closed, nobody contacted.
update cancel_requests r set resolved_at = now()
  from journeys j
  where j.id = r.journey_id and r.resolved_at is null
    and (j.status <> 'monitoring' or r.created_at < now() - interval '24 hours');

--  2. A journey held in CANCEL_HOLD whose row was just closed has no way out of that state,
--     so it is archived, as a silent alarm is. No journey_state row, nothing deleted.
update journeys j set status = 'expired'
  where j.status = 'monitoring'
    and (select s.state from journey_state s where s.journey_id = j.id order by s.changed_at desc limit 1) = 'CANCEL_HOLD'
    and not exists (select 1 from cancel_requests r where r.journey_id = j.id and r.resolved_at is null);

--  3. A row under 24 h on a monitoring journey with a live alarm stays open and the clock takes it over on the next
--     tick: its guardians are asked again and a Safe on the new cycle ends the alarm.

-- The tick reads every open row: rolled ones are how it finds a cycle a run was cut off in.
create index if not exists cancel_requests_clock_idx on cancel_requests (created_at)
  where resolved_at is null;
