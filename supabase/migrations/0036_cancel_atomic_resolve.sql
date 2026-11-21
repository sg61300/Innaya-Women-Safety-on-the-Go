-- Fix lane F1 (founder 2026-11-12, "one unsplittable step"): a guardian's Safe (vote,
-- verdict 'cancel') and the guardian end action (distress -> cancel) must close the cancel
-- request row AND move the alarm state in ONE transaction, so neither can happen without the
-- other and no reader can see the row closed while the alarm is still on.
-- FILE ONLY, never applied by a lane (R16: no database access in the lane); the orchestrator
-- / founder applies it (`node scripts/db/apply-migration.mjs`). Never edit an existing
-- migration; this lands as a new file, ordered after 0035.
--
-- Core (packages/core transition) stays the source of the state decision. The caller runs the
-- pure protocol (so cancelWaiting is read while the row is still open and the core yields
-- RESOLVED_MONITORING + heightened), then passes the decided state + flags here. This function
-- does NOT re-implement the protocol: it only claims the row conditionally and writes the
-- decided outcome, both in one step.
--
-- p_claim_mode:
--   'open'     -> the normal guardian Safe. Claim the row only while it is still open
--                 (resolved_at IS NULL) and stamp resolved_at now; an emergency word or a keep
--                 that closed it first wins (claimed=false, nothing written). p_close_siblings
--                 closes every other still-open cycle of the journey in the same step (so one
--                 Safe answers every open question - fix AD resends).
--   'distress' -> the guardian end action after the emergency word. Claim the newest row only
--                 while it is still 'distress'; two guardians at once -> one claims, the other
--                 gets claimed=false. resolved_at is left as the word's time (today's rule).
-- When the row cannot be claimed, the function writes nothing and returns claimed=false.
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
    values (p_journey_id, p_state, p_reason, p_actor);

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

-- Called only by the server routes under the service role (which bypasses RLS). No signed-in
-- or anonymous caller may run it.
revoke all on function public.cancel_resolve_and_move(uuid, uuid, text, boolean, text, text, text, text, boolean, boolean, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.cancel_resolve_and_move(uuid, uuid, text, boolean, text, text, text, text, boolean, boolean, text, timestamptz, text) to service_role;
