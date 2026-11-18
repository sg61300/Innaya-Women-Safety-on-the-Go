begin;
set local role postgres;
select plan(3);

-- T3: the journeys_v view exists.
select has_view('public', 'journeys_v', 'journeys_v view exists');

-- T3: the view is security_invoker so RLS on journeys is enforced through it
-- (a plain view would run as its postgres owner and leak every journey).
select ok(
  (select 'security_invoker=true' = any (c.reloptions)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'journeys_v'),
  'journeys_v has security_invoker=true');

-- T3: the selfies insert policy exists so the owner can upload their selfie.
select ok(
  exists (select 1 from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'selfies_owner_insert'),
  'selfies_owner_insert policy exists on storage.objects');

select * from finish();
rollback;
