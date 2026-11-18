-- 0003_security_fixes.sql
-- Fixes for the three Important review findings on 0002_functions.sql.
-- 0001/0002 are already applied on hosted; this migration is additive and idempotent
-- (create or replace function / create index if not exists / revoke / grant).
-- Function bodies below are copied verbatim from 0002 apart from the ruled changes.

-- Important 1: the region trigger no-ops for authenticated users because
-- unsafe_regions has RLS with only SELECT+INSERT policies, so the SECURITY INVOKER
-- trigger's UPDATE matches 0 rows. Make it SECURITY DEFINER so it updates through RLS.
create or replace function unsafe_reports_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  select count(distinct reporter_id) into cnt from unsafe_reports where region_id = new.region_id;
  update unsafe_regions set report_count = cnt,
    status = case when cnt > 5 and status <> 'red' then 'red'::region_status else status end
  where id = new.region_id;
  return new;
end $$;
-- (the existing trigger unsafe_reports_after_insert keeps pointing at this function)

-- Important 3: RLS recursion journeys_guardian -> is_active_guardian ->
-- monitoring_assignments.ma_read -> journeys. SECURITY DEFINER breaks the loop by
-- reading monitoring_assignments/contacts without re-entering their RLS policies.
create or replace function is_active_guardian(p_journey_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from monitoring_assignments ma join contacts c on c.id = ma.contact_id
    where ma.journey_id = p_journey_id and ma.active and c.linked_user_id = auth.uid()
  );
$$;
-- policies call this as authenticated; keep it executable by that role
grant execute on function is_active_guardian(uuid) to authenticated;

-- Important 2: nearby_responders was exposed to end users with an unpinned search_path.
-- Pin search_path (st_dwithin/st_setsrid/st_makepoint live in extensions on Supabase),
-- drop the duplicated owner predicate, and round to 3 decimals (~110 m).
create or replace function nearby_responders(p_journey_id uuid, p_radius_m int default 100)
returns table (user_id uuid, expo_push_token text, approx_lat double precision, approx_lng double precision)
language sql security definer set search_path = public, extensions as $$
  with last as (
    select lat, lng from locations where journey_id = p_journey_id order by ts desc limit 1
  ), owner as (
    select owner_id from journeys where id = p_journey_id
  )
  select p.id, p.expo_push_token,
    -- rounded to 3 decimals (~110 m) - approximate until the responder taps 'I can help' (Q7)
    round(l.lat::numeric, 3)::double precision, round(l.lng::numeric, 3)::double precision
  from profiles p, last l, owner o
  where p.id <> o.owner_id and p.expo_push_token is not null
    and p.last_geo_at > now() - interval '10 minutes'
    and st_dwithin(p.last_geo, st_setsrid(st_makepoint(l.lng, l.lat),4326)::geography, p_radius_m);
$$;

-- Lock nearby_responders to the server (service_role) only.
revoke execute on function nearby_responders(uuid, int) from public, anon, authenticated;
grant execute on function nearby_responders(uuid, int) to service_role;

-- next_event_seq is a server-only ledger helper; lock it the same way.
revoke execute on function next_event_seq(uuid) from public, anon, authenticated;
grant execute on function next_event_seq(uuid) to service_role;

-- Minor: index profiles.last_geo so nearby_responders' st_dwithin can use it.
create index if not exists profiles_last_geo_gist on profiles using gist (last_geo);
