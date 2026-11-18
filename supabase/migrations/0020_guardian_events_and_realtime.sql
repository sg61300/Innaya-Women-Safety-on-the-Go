-- Task 30: let a linked, active guardian append their own guardian-side event
-- rows to a trustee's journey. The existing events_owner_insert policy (0002)
-- only allows the journey owner to insert, so guardian.confirmSafe /
-- somethingWrong / lateConfirm and the SOS patch_request log would otherwise be
-- blocked by RLS. Scope the grant to the guardian-authored event types only,
-- and only while is_active_guardian(journey_id) is true.
create policy events_guardian_insert on events
  for insert
  to authenticated
  with check (
    journey_id is not null
    and type in ('guardian_cancel_result', 'guardian_late_confirm', 'patch_request')
    and is_active_guardian(journey_id)
  );

-- G2: the guardian monitor subscribes to postgres_changes on journey_state,
-- locations and events, but those tables were never added to the realtime
-- publication (verified empty on hosted), so no change ever reaches the client.
-- Guardian RLS select policies for all three already exist; adding them to the
-- publication is what actually makes realtime fire.
alter publication supabase_realtime add table journey_state, locations, events;
