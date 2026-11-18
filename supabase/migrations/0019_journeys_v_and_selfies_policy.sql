-- Task 23: journeys_v view — journeys plus the from/to lat/lng pulled out of the
-- geography columns, so the client can read a journey row back as plain numbers
-- (createJourney inserts POINT(lng lat); the runner arms from this view).
-- The task text put this in 0003; the s12 dispatch addendum forbids editing an
-- existing migration, so it lands as a new file. NOT applied to the hosted
-- project by this lane (R16) — orchestrator applies migrations.
--
-- security_invoker = true (hosted Postgres is 17.6): the view runs with the
-- querying user's privileges, so the journeys RLS policies still apply. A plain
-- view is owned by postgres and would let any authenticated user read every
-- journey through the grant below — T3 fix.
create or replace view journeys_v with (security_invoker = true) as
  select j.*,
    st_y(from_geo::geometry) as from_lat,
    st_x(from_geo::geometry) as from_lng,
    st_y(to_geo::geometry)   as to_lat,
    st_x(to_geo::geometry)   as to_lng
  from journeys j;

grant select on journeys_v to authenticated;

-- Task 23 (T3): the journey owner may upload their setup selfie to
-- selfies/<user_id>/<file>.jpg. Mirrors 0016_storage_frames_policy.sql. Reads
-- stay service-role only (the guardian page signs URLs). File only — never
-- applied by a lane (R16).
create policy selfies_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'selfies'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
