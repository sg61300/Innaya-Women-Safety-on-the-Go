-- Metrics rulings R60-R64 (session 20, 2026-09-07). FILE ONLY, NOT applied to the
-- hosted project by this task; the founder applies migrations. Depends on 0026
-- (events.user_id, hardware_interest.user_id, the weekly views). See vault
-- Architecture/08-metrics-taxonomy.md and Decisions/ADR-index.md "Rulings R60-R64".
--
-- What changes vs 0026:
--   R60 Cohort denominator: north star, m2 and m3 are recomputed as signup
--       cohorts. For signup week W the denominator is the users who signed up in
--       W, and a user is in the numerator only if her action happened within 7
--       days of HER signup. The ratio is attributed to the signup week, not the
--       action week.
--   R61 "Completed" journey: journey_completed already fires only at arrival or a
--       confirmed end challenge (never on cancel, expiry or timeout), so the north
--       star numerator needs no change beyond the cohort rule.
--   R62 Go live: m3 stays adoption (>= 2 golive_started). golive_started is also a
--       fear signal in the safety-outcome set; it is surfaced through m3 and noted
--       in the taxonomy, and is NOT mixed into the m7 journey ratio (R64a is
--       journeys only).
--   R63 Regions habit (m2): numerator is users with regions_opened on 2 or more
--       distinct days in the 7-day cohort window (replaces "more than 3 opens").
--   R64 New metrics: m7 safety outcome, m8 website retention, m9 revenue proxy,
--       m10 per-product demand (rows per product slug + tier).
--
-- Every view returns week_start (date), numerator, denominator, ratio (numeric,
-- null when the denominator is 0). Weeks are ISO weeks (Monday start) via
-- date_trunc('week', ts). m10 additionally returns product and tier.

-- North star (R60/R61): signup cohort users who completed a journey within 7 days
-- of signup / users who signed up that week.
create or replace view metrics_weekly_north_star as
with signups as (
  select user_id, min(ts) as signup_ts
  from events where type = 'signup_completed' and user_id is not null
  group by user_id
),
completed as (
  select coalesce(e.user_id, j.owner_id) as user_id, e.ts
  from events e left join journeys j on j.id = e.journey_id
  where e.type = 'journey_completed'
),
cohort as (
  select date_trunc('week', s.signup_ts)::date as week_start, s.user_id,
         bool_or(c.ts >= s.signup_ts and c.ts < s.signup_ts + interval '7 days') as converted
  from signups s left join completed c on c.user_id = s.user_id
  group by 1, s.user_id
)
select week_start,
       count(*) filter (where converted) as numerator,
       count(*) as denominator,
       case when count(*) = 0 then null
            else round(count(*) filter (where converted)::numeric / count(*), 4) end as ratio
from cohort group by 1;

-- M2 (R60/R63): signup cohort users with regions_opened on 2 or more distinct days
-- within 7 days of signup / users who signed up that week.
create or replace view metrics_weekly_m2 as
with signups as (
  select user_id, min(ts) as signup_ts
  from events where type = 'signup_completed' and user_id is not null
  group by user_id
),
regions as (
  select user_id, ts from events where type = 'regions_opened' and user_id is not null
),
cohort as (
  select date_trunc('week', s.signup_ts)::date as week_start, s.user_id,
         count(distinct r.ts::date) filter (
           where r.ts >= s.signup_ts and r.ts < s.signup_ts + interval '7 days'
         ) as distinct_days
  from signups s left join regions r on r.user_id = s.user_id
  group by 1, s.user_id
)
select week_start,
       count(*) filter (where distinct_days >= 2) as numerator,
       count(*) as denominator,
       case when count(*) = 0 then null
            else round(count(*) filter (where distinct_days >= 2)::numeric / count(*), 4) end as ratio
from cohort group by 1;

-- M3 (R60/R62): signup cohort users with 2 or more golive_started within 7 days of
-- signup / users who signed up that week. Adoption stays the metric; golive is also
-- a fear signal in the safety-outcome set (documented, not folded into m7).
create or replace view metrics_weekly_m3 as
with signups as (
  select user_id, min(ts) as signup_ts
  from events where type = 'signup_completed' and user_id is not null
  group by user_id
),
golive as (
  select user_id, ts from events where type = 'golive_started' and user_id is not null
),
cohort as (
  select date_trunc('week', s.signup_ts)::date as week_start, s.user_id,
         count(*) filter (
           where g.ts >= s.signup_ts and g.ts < s.signup_ts + interval '7 days'
         ) as golive_count
  from signups s left join golive g on g.user_id = s.user_id
  group by 1, s.user_id
)
select week_start,
       count(*) filter (where golive_count >= 2) as numerator,
       count(*) as denominator,
       case when count(*) = 0 then null
            else round(count(*) filter (where golive_count >= 2)::numeric / count(*), 4) end as ratio
from cohort group by 1;

-- M7 (R64a): journeys with no EMERGENCY and no CRITICAL state / all journeys started
-- that week. "Started" is journeys.start_at. A journey is a fear outcome if any of
-- its journey_state rows is EMERGENCY or CRITICAL.
create or replace view metrics_weekly_m7 as
with started as (
  select id, date_trunc('week', start_at)::date as week_start from journeys
),
fear as (
  select distinct journey_id from journey_state where state in ('EMERGENCY', 'CRITICAL')
)
select s.week_start,
       count(*) filter (where f.journey_id is null) as numerator,
       count(*) as denominator,
       case when count(*) = 0 then null
            else round(count(*) filter (where f.journey_id is null)::numeric / count(*), 4) end as ratio
from started s left join fear f on f.journey_id = s.id
group by s.week_start;

-- M8 (R64b): distinct site visitors who reserved a product or submitted a form /
-- distinct site visitors that week. Actor is the signed-in user id, else the
-- anonymous visitor_id in payload. Visitors = products_opened or product_viewed;
-- retained = waitlist_form_submitted or product_registered.
create or replace view metrics_weekly_m8 as
with visitors as (
  select date_trunc('week', ts)::date as week_start,
         coalesce(user_id::text, payload->>'visitor_id') as actor
  from events where type in ('products_opened', 'product_viewed')
    and coalesce(user_id::text, payload->>'visitor_id') is not null
),
retained as (
  select date_trunc('week', ts)::date as week_start,
         coalesce(user_id::text, payload->>'visitor_id') as actor
  from events where type in ('waitlist_form_submitted', 'product_registered')
    and coalesce(user_id::text, payload->>'visitor_id') is not null
),
v as (select week_start, count(distinct actor) as n from visitors group by 1),
r as (select week_start, count(distinct actor) as n from retained group by 1)
select coalesce(r.week_start, v.week_start) as week_start,
       coalesce(r.n, 0) as numerator,
       coalesce(v.n, 0) as denominator,
       case when coalesce(v.n, 0) = 0 then null
            else round(coalesce(r.n, 0)::numeric / v.n, 4) end as ratio
from v full outer join r on r.week_start = v.week_start;

-- M9 (R64c): waitlist forms for the Luxury or Haute tiers / all waitlist forms that
-- week. A form is one waitlist_form_submitted event (fires on every valid submit).
create or replace view metrics_weekly_m9 as
with forms as (
  select date_trunc('week', ts)::date as week_start, lower(payload->>'tier') as tier
  from events where type = 'waitlist_form_submitted'
)
select week_start,
       count(*) filter (where tier in ('luxury', 'haute')) as numerator,
       count(*) as denominator,
       case when count(*) = 0 then null
            else round(count(*) filter (where tier in ('luxury', 'haute'))::numeric / count(*), 4) end as ratio
from forms group by 1;

-- M10 (R64d): forms submitted per product per tier per week. numerator is the count
-- for that (product, tier); denominator is all forms that week; ratio is the share.
create or replace view metrics_weekly_m10 as
with forms as (
  select date_trunc('week', ts)::date as week_start,
         payload->>'product' as product, lower(payload->>'tier') as tier
  from events where type = 'waitlist_form_submitted' and payload->>'product' is not null
),
totals as (select week_start, count(*) as total from forms group by 1)
select f.week_start, f.product, f.tier,
       count(*) as numerator,
       t.total as denominator,
       case when t.total = 0 then null else round(count(*)::numeric / t.total, 4) end as ratio
from forms f join totals t on t.week_start = f.week_start
group by f.week_start, f.product, f.tier, t.total;

-- Union roll-up: one row per (metric, week_start). m10 encodes its product and tier
-- in the metric label so the union keeps the five-column shape.
create or replace view metrics_weekly as
  select 'north_star'::text as metric, week_start, numerator, denominator, ratio from metrics_weekly_north_star
  union all select 'm2', week_start, numerator, denominator, ratio from metrics_weekly_m2
  union all select 'm3', week_start, numerator, denominator, ratio from metrics_weekly_m3
  union all select 'm4', week_start, numerator, denominator, ratio from metrics_weekly_m4
  union all select 'm5', week_start, numerator, denominator, ratio from metrics_weekly_m5
  union all select 'm6', week_start, numerator, denominator, ratio from metrics_weekly_m6
  union all select 'm7', week_start, numerator, denominator, ratio from metrics_weekly_m7
  union all select 'm8', week_start, numerator, denominator, ratio from metrics_weekly_m8
  union all select 'm9', week_start, numerator, denominator, ratio from metrics_weekly_m9
  union all select 'm10:' || product || ':' || coalesce(tier, 'none'), week_start, numerator, denominator, ratio from metrics_weekly_m10;

-- ---------------------------------------------------------------------------
-- VERIFY (run manually after applying; NEVER commit seed rows to the hosted DB).
-- Self-contained: seeds two auth users + profiles, one week of funnel events,
-- two journeys (one with an EMERGENCY state), and three waitlist forms, then each
-- view returns the ratios noted. Wrap in a transaction and roll back.
--
-- begin;
--   insert into auth.users (id, email) values
--     ('00000000-0000-0000-0000-000000000001', 'v1@test.local'),
--     ('00000000-0000-0000-0000-000000000002', 'v2@test.local');
--   insert into profiles (id) values
--     ('00000000-0000-0000-0000-000000000001'),
--     ('00000000-0000-0000-0000-000000000002');
--   -- both sign up this week
--   insert into events (type, user_id, ts) values
--     ('signup_completed', '00000000-0000-0000-0000-000000000001', now()),
--     ('signup_completed', '00000000-0000-0000-0000-000000000002', now());
--   -- user 1 completes a journey within 7 days (north star 1 / 2 = 0.5)
--   insert into events (type, user_id, ts) values
--     ('journey_completed', '00000000-0000-0000-0000-000000000001', now());
--   -- user 1 opens Regions on 2 distinct days within the window (m2 1 / 2 = 0.5)
--   insert into events (type, user_id, ts) values
--     ('regions_opened', '00000000-0000-0000-0000-000000000001', now()),
--     ('regions_opened', '00000000-0000-0000-0000-000000000001', now() + interval '1 day');
--   -- user 2 goes live twice within the window (m3 1 / 2 = 0.5)
--   insert into events (type, user_id, ts) values
--     ('golive_started', '00000000-0000-0000-0000-000000000002', now()),
--     ('golive_started', '00000000-0000-0000-0000-000000000002', now() + interval '1 hour');
--   -- two journeys start this week; one escalates to EMERGENCY (m7 1 / 2 = 0.5)
--   insert into journeys (id, owner_id, from_label, to_label, from_geo, to_geo,
--       start_at, mode, are_you_safe_word_hash, selfie_url, consent_version)
--     values
--     ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001',
--       'a', 'b', st_point(0,0)::geography, st_point(1,1)::geography, now(), 'walk', 'x', 'x', 'v1'),
--     ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000002',
--       'a', 'b', st_point(0,0)::geography, st_point(1,1)::geography, now(), 'walk', 'x', 'x', 'v1');
--   insert into journey_state (journey_id, state, changed_by)
--     values ('00000000-0000-0000-0000-0000000000a1', 'EMERGENCY', 'test');
--   -- three waitlist forms: 2 site visitors open, one anon submits a haute form,
--   -- user 1 submits a standard form (m8 retained 2 / visitors 2 = 1.0;
--   -- m9 luxury+haute 1 / 3 forms... here 1 haute of 2 forms -> adjust as needed;
--   -- m10 one row per (product, tier)).
--   insert into events (type, user_id, payload, ts) values
--     ('products_opened', '00000000-0000-0000-0000-000000000001', '{}'::jsonb, now()),
--     ('product_viewed', null, '{"visitor_id":"v-guest","product":"pendant"}'::jsonb, now()),
--     ('waitlist_form_submitted', null, '{"visitor_id":"v-guest","product":"pendant","tier":"haute"}'::jsonb, now()),
--     ('waitlist_form_submitted', '00000000-0000-0000-0000-000000000001', '{"product":"bangle","tier":"standard"}'::jsonb, now());
--   -- Expect this week: north_star 0.5, m2 0.5, m3 0.5, m7 0.5,
--   --   m8 numerator 2 / denominator 2 = 1.0 (both visitors reserved/submitted),
--   --   m9 numerator 1 (haute) / denominator 2 forms = 0.5,
--   --   m10 rows: pendant/haute 1/2 = 0.5, bangle/standard 1/2 = 0.5.
--   select * from metrics_weekly order by metric, week_start;
-- rollback;
