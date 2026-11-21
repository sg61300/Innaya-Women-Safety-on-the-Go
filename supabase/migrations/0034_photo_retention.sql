-- Fix lane D6 (founder Q127, 2026-11-08): the server deletes trip photos 30 days after
-- they were taken; fix lane D7 (founder Q133, 2026-11-11): photos and videos. FILE ONLY, never applied by a lane (R16); the orchestrator applies it.
--
-- This function only LISTS what may go; the deadman route deletes through the Storage
-- API (a plain delete on storage.objects would leave the file behind). Age is the
-- object's upload time, which is never earlier than the moment the photo was taken.
--
-- Deleted (each path is written by exactly one place in the app):
--   frames/<journey_id>/<captured_ms>.jpg                  alarm photos (camera.ts)
--   selfies/<user_id>/<ms>-<random>.jpg                    journey-start selfie (journey.ts)
--   selfies/<user_id>/cancel/<journey_id>/<uuid>.jpg|.mp4  cancel proof photo or video (cancelFlowDeps.ts)
--   selfies/<user_id>/challenge-<journey_id>-<ms>.jpg      ARE-YOU-SAFE check selfie (AreYouSafeModal.tsx)
--   selfies/simulation/<user_id>/<uuid>.jpg|.mp4           practice-run proof (api simulate-proof)
--   (fix lane D7, founder Q133: photos AND videos; the last three kinds added)
-- Kept, because no pattern above matches them:
--   selfies/<user_id>/profile.jpg                          her profile photo
--   the recordings bucket (audio)
-- Never listed while an alarm is live: frames of that journey, and every selfie of
-- its owner (for a practice proof the owner is the second folder). Live means the latest protocol state is EMERGENCY, CRITICAL or
-- CANCEL_HOLD and the journey is not archived (status expired/done), the same rule as
-- apps/api/src/lib/liveGate.ts.
create or replace function public.photo_retention_candidates(p_before timestamptz, p_limit int default 200)
returns table (bucket_id text, name text, created_at timestamptz)
language sql stable security definer set search_path = public, storage, pg_temp as $$
  with live as (
    select j.id, j.owner_id
      from public.journeys j
     where j.status not in ('expired', 'done')
       and (select s.state from public.journey_state s
             where s.journey_id = j.id
             order by s.changed_at desc, s.id desc limit 1)
           in ('EMERGENCY', 'CRITICAL', 'CANCEL_HOLD')
  )
  select o.bucket_id, o.name, o.created_at
    from storage.objects o
   where o.created_at < p_before
     and (
       (o.bucket_id = 'frames'
         and o.name ~ '^[0-9a-f-]{36}/[0-9]+\.jpg$'
         and split_part(o.name, '/', 1) not in (select l.id::text from live l))
       or
       (o.bucket_id = 'selfies'
         and (o.name ~ '^[0-9a-f-]{36}/[0-9]+-[0-9a-z]+\.jpg$'
           or o.name ~ '^[0-9a-f-]{36}/cancel/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|mp4)$'
           or o.name ~ '^[0-9a-f-]{36}/challenge-[0-9a-f-]{36}-[0-9]+\.jpg$')
         and split_part(o.name, '/', 1) not in (select l.owner_id::text from live l))
       or
       (o.bucket_id = 'selfies'
         and o.name ~ '^simulation/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|mp4)$'
         and split_part(o.name, '/', 2) not in (select l.owner_id::text from live l))
     )
   order by o.created_at
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

revoke all on function public.photo_retention_candidates(timestamptz, int) from public, anon, authenticated;
grant execute on function public.photo_retention_candidates(timestamptz, int) to service_role;
