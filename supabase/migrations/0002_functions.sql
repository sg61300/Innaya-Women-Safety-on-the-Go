-- report count + threshold flip (distinct reporters)
create or replace function unsafe_reports_after_insert() returns trigger language plpgsql as $$
declare cnt int;
begin
  select count(distinct reporter_id) into cnt from unsafe_reports where region_id = new.region_id;
  update unsafe_regions set report_count = cnt,
    status = case when cnt > 5 and status <> 'red' then 'red'::region_status else status end
  where id = new.region_id;
  return new;
end $$;
create trigger unsafe_reports_after_insert after insert on unsafe_reports
for each row execute function unsafe_reports_after_insert();

-- monotonic event seq per journey
create or replace function next_event_seq(p_journey_id uuid) returns bigint language sql as $$
  select coalesce(max(seq),0)+1 from events where journey_id = p_journey_id;
$$;

-- nearby app users (Q7 settled: ALL users with a push token, not only opt-ins), location rounded to ~50 m grid
create or replace function nearby_responders(p_journey_id uuid, p_radius_m int default 100)
returns table (user_id uuid, expo_push_token text, approx_lat double precision, approx_lng double precision)
language sql security definer as $$
  with last as (
    select lat, lng from locations where journey_id = p_journey_id order by ts desc limit 1
  ), owner as (
    select owner_id from journeys where id = p_journey_id
  )
  select p.id, p.expo_push_token,
    round(l.lat::numeric, 4)::double precision, round(l.lng::numeric, 4)::double precision
  from profiles p, last l, owner o
  where p.id <> o.owner_id and p.expo_push_token is not null
    and p.last_geo_at > now() - interval '10 minutes'
    and st_dwithin(p.last_geo, st_setsrid(st_makepoint(l.lng, l.lat),4326)::geography, p_radius_m)
    and p.id <> (select owner_id from journeys where id = p_journey_id);
$$;

-- guardian helper: is caller an active watcher of this journey?
create or replace function is_active_guardian(p_journey_id uuid) returns boolean language sql stable as $$
  select exists (
    select 1 from monitoring_assignments ma join contacts c on c.id = ma.contact_id
    where ma.journey_id = p_journey_id and ma.active and c.linked_user_id = auth.uid()
  );
$$;

alter table profiles enable row level security;
alter table contacts enable row level security;
alter table safety_words enable row level security;
alter table journeys enable row level security;
alter table journey_state enable row level security;
alter table locations enable row level security;
alter table heartbeats enable row level security;
alter table events enable row level security;
alter table challenges enable row level security;
alter table monitoring_assignments enable row level security;
alter table alerts enable row level security;
alter table unsafe_regions enable row level security;
alter table unsafe_reports enable row level security;
alter table blacklisted_vehicles enable row level security;
alter table vitals enable row level security;
alter table terms_versions enable row level security;

create policy profiles_self on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy contacts_owner on contacts for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy contacts_linked_read on contacts for select using (linked_user_id = auth.uid());
create policy words_owner on safety_words for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy journeys_owner on journeys for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy journeys_guardian on journeys for select using (is_active_guardian(id));
create policy state_read on journey_state for select using (
  exists (select 1 from journeys j where j.id = journey_id and (j.owner_id = auth.uid() or is_active_guardian(j.id))));
create policy loc_owner_insert on locations for insert with check (exists (select 1 from journeys j where j.id = journey_id and j.owner_id = auth.uid()));
create policy loc_read on locations for select using (
  exists (select 1 from journeys j where j.id = journey_id and (j.owner_id = auth.uid() or is_active_guardian(j.id))));
create policy hb_owner_insert on heartbeats for insert with check (exists (select 1 from journeys j where j.id = journey_id and j.owner_id = auth.uid()));
create policy hb_read on heartbeats for select using (exists (select 1 from journeys j where j.id = journey_id and (j.owner_id = auth.uid() or is_active_guardian(j.id))));
create policy events_owner_insert on events for insert with check (journey_id is null or exists (select 1 from journeys j where j.id = journey_id and j.owner_id = auth.uid()));
create policy events_read on events for select using (exists (select 1 from journeys j where j.id = journey_id and (j.owner_id = auth.uid() or is_active_guardian(j.id))));
create policy events_feedback on events for update using (exists (select 1 from journeys j where j.id = journey_id and j.owner_id = auth.uid()));
create policy challenges_owner on challenges for all using (exists (select 1 from journeys j where j.id = journey_id and j.owner_id = auth.uid()));
create policy ma_read on monitoring_assignments for select using (
  exists (select 1 from journeys j where j.id = journey_id and j.owner_id = auth.uid())
  or exists (select 1 from contacts c where c.id = contact_id and c.linked_user_id = auth.uid()));
create policy alerts_read on alerts for select using (exists (select 1 from journeys j where j.id = journey_id and j.owner_id = auth.uid()));
create policy regions_read on unsafe_regions for select using (true);
create policy regions_insert on unsafe_regions for insert with check (auth.uid() is not null);
create policy reports_read on unsafe_reports for select using (true);
create policy reports_insert on unsafe_reports for insert with check (reporter_id = auth.uid());
create policy blacklist_read on blacklisted_vehicles for select using (true);
create policy vitals_owner on vitals for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy terms_read on terms_versions for select using (true);
-- journey_state, monitoring_assignments (write), alerts (write): service role only (ledger tables; see memory rule)
