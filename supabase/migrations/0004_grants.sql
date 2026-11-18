-- 0004_grants.sql — explicit table/sequence privileges for the PostgREST roles.
-- Why: on this project the default ACL for tables created by `postgres` grants anon/authenticated/service_role
-- only TRUNCATE/REFERENCES/TRIGGER/MAINTAIN (verified 2026-09-04 via pg_default_acl), so every table created by
-- 0001 was unreadable through the API. RLS still decides row visibility; these are the table-level gates.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
-- anon: only what an unauthenticated client may need before login (terms text, public region map)
grant select on terms_versions, unsafe_regions to anon;
-- keep future tables consistent (Task 13+ migrations run as postgres)
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges for role postgres in schema public grant usage, select on sequences to authenticated, service_role;
-- least privilege: the client roles never truncate, create FKs to, or attach triggers on our tables
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
