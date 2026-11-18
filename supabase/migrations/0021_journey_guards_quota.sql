-- ADR-038/039 (session 10, 2026-09-05): persist the camera pause and the open challenge kind,
-- add the anomaly flag, and enforce the daily quota server-side.
alter table journeys add column if not exists camera_paused_at timestamptz;
alter table journeys add column if not exists challenge_kind text check (challenge_kind in ('check','pause','stationary','route','away'));
alter table profiles add column if not exists anomaly_flag boolean not null default false;
alter table profiles add column if not exists anomaly_reason text;

-- Rolling-24 h usage. A journey's monitored span = start_at .. (RESOLVED time | now if still monitoring | start_at if never started).
create or replace function journey_quota_check(p_owner uuid)
returns table (journeys_24h int, monitoring_minutes_24h int, soft boolean, hard boolean)
language sql stable security definer set search_path = public as $$
  with spans as (
    select j.id,
           greatest(j.start_at, now() - interval '24 hours') as s,
           least(coalesce((select max(js.changed_at) from journey_state js where js.journey_id = j.id and js.state = 'RESOLVED'),
                          case when j.status = 'monitoring' then now() else j.start_at end), now()) as e
    from journeys j
    where j.owner_id = p_owner and j.start_at >= now() - interval '24 hours' and j.status <> 'cancelled'
  )
  select count(*)::int,
         coalesce(sum(greatest(0, extract(epoch from (e - s)) / 60))::int, 0),
         count(*) > 6 or coalesce(sum(greatest(0, extract(epoch from (e - s)) / 60)), 0) > 600,
         coalesce(sum(greatest(0, extract(epoch from (e - s)) / 60)), 0) >= 960
  from spans;
$$;
revoke all on function journey_quota_check(uuid) from public, anon;
grant execute on function journey_quota_check(uuid) to authenticated, service_role;

create or replace function journeys_quota_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare q record;
begin
  select * into q from journey_quota_check(new.owner_id);
  if q.hard then
    raise exception 'VAIRA_QUOTA_HARD' using errcode = 'P0001', detail = format('%s minutes monitored in 24 h', q.monitoring_minutes_24h);
  end if;
  if q.soft then
    update profiles set anomaly_flag = true, anomaly_reason = format('soft quota: %s journeys, %s min in 24 h at %s', q.journeys_24h + 1, q.monitoring_minutes_24h, now())
    where id = new.owner_id;
  end if;
  return new;
end $$;
drop trigger if exists journeys_quota on journeys;
create trigger journeys_quota before insert on journeys for each row execute function journeys_quota_guard();
