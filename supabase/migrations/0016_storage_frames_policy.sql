-- Task 26 (ADR-019): the journey owner may upload masked frames to frames/<journey_id>/<ts>.jpg.
-- Reads stay service-role only (guardian page signs URLs). File only — never applied by a lane (R16).
create policy frames_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'frames'
    and exists (
      select 1 from public.journeys j
      where j.id::text = (storage.foldername(name))[1] and j.owner_id = auth.uid()
    )
  );
