-- 0038: fix 0036's cancel_resolve_and_move (founder 2026-11-14, found by the 0036 SQL test on hosted).
--
-- Bug: journey_state.state is the enum protocol_state (0001:6), but 0036 inserted the text
-- parameter p_state without a cast. Every call failed:
--   ERROR 42804: column "state" is of type protocol_state but expression is of type text
-- No harm in production: the live API (old code) never calls this function; the new API was not
-- deployed. The app tests passed because they use a JS stand-in for the database step.
--
-- Change: the same function body with p_state::protocol_state. CREATE OR REPLACE keeps the
-- existing grants (service_role only). status, challenge_kind and alarm_mode are text columns.
-- Never edit 0036 (already applied); this lands as a new file.
create or replace function public.cancel_resolve_and_move(
  p_journey_id uuid,
  p_request_id uuid,
  p_claim_mode text,
  p_close_siblings boolean,
  p_state text,
  p_reason text,
  p_actor text,
  p_status text,
  p_ending boolean,
  p_heightened boolean,
  p_challenge_kind text,
  p_camera_paused_at timestamptz,
  p_alarm_mode text
) returns table (claimed boolean, moved_state text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- 1. Conditional claim of the one row (the concurrency gate).
  if p_claim_mode = 'open' then
    update cancel_requests set verdict = 'cancel', resolved_at = now()
      where id = p_request_id and resolved_at is null;
  elsif p_claim_mode = 'distress' then
    update cancel_requests set verdict = 'cancel'
      where id = p_request_id and verdict = 'distress';
  else
    raise exception 'cancel_resolve_and_move: unknown p_claim_mode %', p_claim_mode;
  end if;

  if not found then
    claimed := false; moved_state := null; return next; return;
  end if;

  -- 2. The normal Safe also closes every other still-open cycle of this journey.
  if p_close_siblings then
    update cancel_requests set verdict = 'cancel', resolved_at = now()
      where journey_id = p_journey_id and resolved_at is null;
  end if;

  -- 3. Move the alarm state and persist the journey flags the core decided.
  insert into journey_state (journey_id, state, reason, changed_by)
    values (p_journey_id, p_state::protocol_state, p_reason, p_actor);

  update journeys set
      status = p_status,
      ending = p_ending,
      heightened = p_heightened,
      challenge_kind = p_challenge_kind,
      camera_paused_at = p_camera_paused_at,
      alarm_mode = p_alarm_mode
    where id = p_journey_id;

  claimed := true; moved_state := p_state; return next;
end;
$$;
