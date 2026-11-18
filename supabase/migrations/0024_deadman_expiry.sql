-- ADR-042 / R47c (session 16, 2026-09-06). FILE ONLY — NOT applied to hosted by
-- this task; the orchestrator applies it. The dead-man watchdog must also expire
-- an EMERGENCY/CRITICAL journey that has sent no heartbeat AND no frame for 15 min.
-- To decide that on the server, monitoring_snapshot() now also returns the latest
-- battery level (0–1), the last `frame` event time, and — so a just-raised alarm is
-- not expired before it can send anything (C1-1) — the time the latest protocol
-- state began, per monitoring journey.
--
-- Adding OUT columns changes the function's return type, so drop then recreate.
drop function if exists monitoring_snapshot();

create or replace function monitoring_snapshot()
returns table (
  journey_id uuid,
  state protocol_state,
  last_heartbeat_at timestamptz,
  battery_low boolean,
  battery real,
  last_frame_at timestamptz,
  state_changed_at timestamptz
)
language sql security definer as $$
  select j.id,
    (select s.state from journey_state s where s.journey_id = j.id order by s.changed_at desc limit 1),
    (select h.ts from heartbeats h where h.journey_id = j.id order by h.ts desc limit 1),
    coalesce((select h.battery_low from heartbeats h where h.journey_id = j.id order by h.ts desc limit 1), false),
    (select h.battery from heartbeats h where h.journey_id = j.id order by h.ts desc limit 1),
    (select max(e.ts) from events e where e.journey_id = j.id and e.type = 'frame'),
    (select s.changed_at from journey_state s where s.journey_id = j.id order by s.changed_at desc limit 1)
  from journeys j where j.status = 'monitoring';
$$;
