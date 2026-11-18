-- Task 12: server-authoritative journey state.
-- `ending` tracks the arrival/end grace window (set by the protocol transition);
-- is_active_guardian_for gates guardian-sent events on /api/journey-state.

alter table journeys add column if not exists ending boolean not null default false;

create or replace function is_active_guardian_for(p_journey_id uuid, p_user_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from monitoring_assignments ma
    join contacts c on c.id = ma.contact_id
    where ma.journey_id = p_journey_id and ma.active and c.linked_user_id = p_user_id
  );
$$;
