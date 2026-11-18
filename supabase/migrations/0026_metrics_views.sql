-- Metrics taxonomy + weekly views (session 19, 2026-09-07). FILE ONLY, NOT applied
-- to the hosted project by this task; the founder applies migrations. Follows the
-- style of 0024/0025. See Architecture/08-metrics-taxonomy.md for the full plan.
--
-- Why user_id on events: the funnel metrics are all per user, but events only had
-- journey_id (nullable). Signup, regions, go-live, tools and classes fire with no
-- journey, so without a user column they cannot be attributed. We add user_id and
-- stamp it from the signed-in session on the client; server-side rows (waitlist,
-- products_opened) set it via the service role.

-- 1) Actor column on events -----------------------------------------------------
alter table events add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists events_user_type_idx on events (user_id, type);
create index if not exists events_type_ts_idx  on events (type, ts);

-- 1b) Attribution on the waitlist row: user_id when the registrant was signed in
-- (the site is usually anonymous, so this is often null and M6 counts by row).
alter table hardware_interest add column if not exists user_id uuid references auth.users(id) on delete set null;

-- 2) RLS: allow a signed-in user to insert their own no-journey funnel events.
-- A journey event still requires ownership; a no-journey event must carry the
-- caller's own uid (or null), so a user can never write events as someone else.
drop policy if exists events_owner_insert on events;
create policy events_owner_insert on events for insert with check (
  (journey_id is not null and exists (select 1 from journeys j where j.id = journey_id and j.owner_id = auth.uid()))
  or (journey_id is null and (user_id is null or user_id = auth.uid()))
);

-- 3) Weekly metric views --------------------------------------------------------
-- Every view returns: week_start (date), numerator, denominator, ratio (numeric,
-- null when the denominator is 0). Weeks are ISO weeks (Monday start) via
-- date_trunc('week', ts). All ratios are activity within the same week.

-- North star: users who completed a journey / users who signed up (that week).
create or replace view metrics_weekly_north_star as
with signups as (
  select date_trunc('week', ts)::date as week_start, count(distinct user_id) as n
  from events where type = 'signup_completed' and user_id is not null group by 1
),
completed as (
  select date_trunc('week', e.ts)::date as week_start,
         count(distinct coalesce(e.user_id, j.owner_id)) as n
  from events e left join journeys j on j.id = e.journey_id
  where e.type = 'journey_completed' group by 1
)
select coalesce(c.week_start, s.week_start) as week_start,
       coalesce(c.n, 0) as numerator,
       coalesce(s.n, 0) as denominator,
       case when coalesce(s.n, 0) = 0 then null
            else round(coalesce(c.n, 0)::numeric / s.n, 4) end as ratio
from signups s full outer join completed c on c.week_start = s.week_start;

-- M2: users who opened Regions > 3 times / users who signed up.
create or replace view metrics_weekly_m2 as
with signups as (
  select date_trunc('week', ts)::date as week_start, count(distinct user_id) as n
  from events where type = 'signup_completed' and user_id is not null group by 1
),
heavy as (
  select week_start, count(*) as n from (
    select date_trunc('week', ts)::date as week_start, user_id, count(*) as c
    from events where type = 'regions_opened' and user_id is not null
    group by 1, 2
  ) t where t.c > 3 group by 1
)
select coalesce(h.week_start, s.week_start) as week_start,
       coalesce(h.n, 0) as numerator,
       coalesce(s.n, 0) as denominator,
       case when coalesce(s.n, 0) = 0 then null
            else round(coalesce(h.n, 0)::numeric / s.n, 4) end as ratio
from signups s full outer join heavy h on h.week_start = s.week_start;

-- M3: users who used "Go live with your fans" >= 2 times / users who signed up.
create or replace view metrics_weekly_m3 as
with signups as (
  select date_trunc('week', ts)::date as week_start, count(distinct user_id) as n
  from events where type = 'signup_completed' and user_id is not null group by 1
),
heavy as (
  select week_start, count(*) as n from (
    select date_trunc('week', ts)::date as week_start, user_id, count(*) as c
    from events where type = 'golive_started' and user_id is not null
    group by 1, 2
  ) t where t.c >= 2 group by 1
)
select coalesce(h.week_start, s.week_start) as week_start,
       coalesce(h.n, 0) as numerator,
       coalesce(s.n, 0) as denominator,
       case when coalesce(s.n, 0) = 0 then null
            else round(coalesce(h.n, 0)::numeric / s.n, 4) end as ratio
from signups s full outer join heavy h on h.week_start = s.week_start;

-- M4: users who clicked a tool / users who opened the Tools page.
create or replace view metrics_weekly_m4 as
with opened as (
  select date_trunc('week', ts)::date as week_start, count(distinct user_id) as n
  from events where type = 'tools_opened' and user_id is not null group by 1
),
clicked as (
  select date_trunc('week', ts)::date as week_start, count(distinct user_id) as n
  from events where type = 'tool_clicked' and user_id is not null group by 1
)
select coalesce(c.week_start, o.week_start) as week_start,
       coalesce(c.n, 0) as numerator,
       coalesce(o.n, 0) as denominator,
       case when coalesce(o.n, 0) = 0 then null
            else round(coalesce(c.n, 0)::numeric / o.n, 4) end as ratio
from opened o full outer join clicked c on c.week_start = o.week_start;

-- M5: users who selected a class card AND tapped Call or Map / users who opened
-- Classes. A Call or Map tap always co-fires class_card_selected, so a user with
-- either class_call_clicked or class_map_clicked satisfies the "selected AND tapped".
create or replace view metrics_weekly_m5 as
with opened as (
  select date_trunc('week', ts)::date as week_start, count(distinct user_id) as n
  from events where type = 'classes_opened' and user_id is not null group by 1
),
acted as (
  select date_trunc('week', ts)::date as week_start, count(distinct user_id) as n
  from events where type in ('class_call_clicked', 'class_map_clicked') and user_id is not null group by 1
)
select coalesce(a.week_start, o.week_start) as week_start,
       coalesce(a.n, 0) as numerator,
       coalesce(o.n, 0) as denominator,
       case when coalesce(o.n, 0) = 0 then null
            else round(coalesce(a.n, 0)::numeric / o.n, 4) end as ratio
from opened o full outer join acted a on a.week_start = o.week_start;

-- M6: users who registered for a physical product / users who opened the physical
-- products page. Site visitors may be anonymous, so the actor is the signed-in
-- user id when present, else the anonymous visitor_id carried in payload. Both
-- products_opened and product_registered carry the same visitor_id, so numerator
-- and denominator share an actor space.
create or replace view metrics_weekly_m6 as
with opened as (
  select date_trunc('week', ts)::date as week_start,
         count(distinct coalesce(user_id::text, payload->>'visitor_id')) as n
  from events where type = 'products_opened'
    and coalesce(user_id::text, payload->>'visitor_id') is not null group by 1
),
registered as (
  select date_trunc('week', ts)::date as week_start,
         count(distinct coalesce(user_id::text, payload->>'visitor_id')) as n
  from events where type = 'product_registered'
    and coalesce(user_id::text, payload->>'visitor_id') is not null group by 1
)
select coalesce(r.week_start, o.week_start) as week_start,
       coalesce(r.n, 0) as numerator,
       coalesce(o.n, 0) as denominator,
       case when coalesce(o.n, 0) = 0 then null
            else round(coalesce(r.n, 0)::numeric / o.n, 4) end as ratio
from opened o full outer join registered r on r.week_start = o.week_start;

-- Union roll-up: one row per (metric, week_start) for a single dashboard query.
create or replace view metrics_weekly as
  select 'north_star'::text as metric, week_start, numerator, denominator, ratio from metrics_weekly_north_star
  union all select 'm2', week_start, numerator, denominator, ratio from metrics_weekly_m2
  union all select 'm3', week_start, numerator, denominator, ratio from metrics_weekly_m3
  union all select 'm4', week_start, numerator, denominator, ratio from metrics_weekly_m4
  union all select 'm5', week_start, numerator, denominator, ratio from metrics_weekly_m5
  union all select 'm6', week_start, numerator, denominator, ratio from metrics_weekly_m6;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY (run manually after applying; do NOT commit seed rows to the hosted DB).
-- Seeds one week of events for two users + one anonymous site visitor, then each
-- view should return the ratios noted. Wrap in a transaction and roll back.
--
-- begin;
--   -- two users sign up this week
--   insert into events (type, user_id, ts) values
--     ('signup_completed', '00000000-0000-0000-0000-000000000001', now()),
--     ('signup_completed', '00000000-0000-0000-0000-000000000002', now());
--   -- user 1 completes a journey (north star numerator = 1, denominator = 2 => 0.5)
--   insert into events (type, user_id, ts) values
--     ('journey_completed', '00000000-0000-0000-0000-000000000001', now());
--   -- user 1 opens Regions 4 times (> 3 => M2 numerator 1 / 2 = 0.5)
--   insert into events (type, user_id, ts)
--     select 'regions_opened', '00000000-0000-0000-0000-000000000001', now() from generate_series(1,4);
--   -- user 2 goes live twice (>= 2 => M3 numerator 1 / 2 = 0.5)
--   insert into events (type, user_id, ts)
--     select 'golive_started', '00000000-0000-0000-0000-000000000002', now() from generate_series(1,2);
--   -- Tools: both open, one clicks (M4 = 1 / 2 = 0.5)
--   insert into events (type, user_id, ts) values
--     ('tools_opened', '00000000-0000-0000-0000-000000000001', now()),
--     ('tools_opened', '00000000-0000-0000-0000-000000000002', now()),
--     ('tool_clicked', '00000000-0000-0000-0000-000000000001', now());
--   -- Classes: both open, one calls (M5 = 1 / 2 = 0.5)
--   insert into events (type, user_id, ts) values
--     ('classes_opened', '00000000-0000-0000-0000-000000000001', now()),
--     ('classes_opened', '00000000-0000-0000-0000-000000000002', now()),
--     ('class_card_selected', '00000000-0000-0000-0000-000000000001', now()),
--     ('class_call_clicked', '00000000-0000-0000-0000-000000000001', now());
--   -- Products: two visitors open (one user, one anon), the anon registers
--   insert into events (type, user_id, payload, ts) values
--     ('products_opened', '00000000-0000-0000-0000-000000000001', '{}'::jsonb, now()),
--     ('products_opened', null, '{"visitor_id":"v-guest"}'::jsonb, now()),
--     ('product_registered', null, '{"visitor_id":"v-guest","product":"pendant"}'::jsonb, now());
--   -- Expect: north_star 1/2, m2 1/2, m3 1/2, m4 1/2, m5 1/2, m6 1/2 for this week.
--   select * from metrics_weekly order by metric, week_start;
-- rollback;
