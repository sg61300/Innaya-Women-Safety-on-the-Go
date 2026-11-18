-- 0006_realtime.test.sql
-- G2: the guardian monitor only receives live updates if journey_state,
-- locations and events are members of the supabase_realtime publication.
-- Migration 0020 adds them; this proves all three are present.
-- pgTAP functions live in the extensions schema on hosted; search_path includes
-- it, so plan/ok/finish are called unqualified.
begin;
select plan(3);

select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'journey_state'),
  'journey_state is in the supabase_realtime publication');

select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'locations'),
  'locations is in the supabase_realtime publication');

select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'),
  'events is in the supabase_realtime publication');

select * from finish();
rollback;
