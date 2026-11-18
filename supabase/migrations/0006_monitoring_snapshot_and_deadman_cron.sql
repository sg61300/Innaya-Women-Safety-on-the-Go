-- Task 13: dead-man watchdog.
-- monitoring_snapshot() returns, per monitoring journey, its latest state +
-- heartbeat for the /api/cron/deadman route. Scheduling lives on Supabase pg_cron
-- + pg_net (Vercel Hobby crons run at most once/day — amendment 13), calling the
-- api every 30 s with the CRON_SECRET bearer.
--
-- The endpoint URL and secret are read from database GUCs so no value is baked in.
-- Operator step (Task 10), once the real deploy URL exists, as the db owner:
--   alter database postgres set app.api_base   = 'https://<vercel-prod-url>';
--   alter database postgres set app.cron_secret = '<CRON_SECRET>';
-- or for an ad-hoc test:  select set_config('app.api_base', 'https://…', false);
-- current_setting(..., true) is used so an UNSET GUC yields NULL (a failing HTTP
-- call, which is tolerable) instead of raising and failing the job run (R8).

create or replace function monitoring_snapshot()
returns table (journey_id uuid, state protocol_state, last_heartbeat_at timestamptz, battery_low boolean)
language sql security definer as $$
  select j.id,
    (select s.state from journey_state s where s.journey_id = j.id order by s.changed_at desc limit 1),
    (select h.ts from heartbeats h where h.journey_id = j.id order by h.ts desc limit 1),
    coalesce((select h.battery_low from heartbeats h where h.journey_id = j.id order by h.ts desc limit 1), false)
  from journeys j where j.status = 'monitoring';
$$;

-- Replace any prior schedule so re-applying is idempotent.
do $$
begin
  perform cron.unschedule('vaira-deadman');
exception when others then
  null;
end $$;

-- Prefer a 30 s cadence (needs pg_cron >= 1.5 / Postgres >= 15.1.1.61, the default
-- on new Supabase projects); fall back to once-a-minute on older projects.
do $$
begin
  perform cron.schedule('vaira-deadman', '30 seconds',
    $cron$ select net.http_post(
      url := current_setting('app.api_base', true) || '/api/cron/deadman',
      headers := jsonb_build_object('authorization', 'Bearer ' || current_setting('app.cron_secret', true)),
      timeout_milliseconds := 8000) $cron$);
exception when others then
  perform cron.schedule('vaira-deadman', '* * * * *',
    $cron$ select net.http_post(
      url := current_setting('app.api_base', true) || '/api/cron/deadman',
      headers := jsonb_build_object('authorization', 'Bearer ' || current_setting('app.cron_secret', true)),
      timeout_milliseconds := 8000) $cron$);
end $$;
