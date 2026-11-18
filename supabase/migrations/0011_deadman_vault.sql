-- Task 13 follow-up (session 08, 2026-09-04): the dead-man job read its target URL and
-- bearer secret from custom GUCs (app.api_base / app.cron_secret, migration 0006). On
-- Supabase the postgres role cannot persist custom GUCs at all — both
--   alter database postgres set app.api_base = '…'   and
--   alter role     postgres set app.api_base = '…'
-- fail with 42501 (postgres is neither superuser nor the database owner), so every run
-- failed with a NULL url. The job now reads both values from Supabase Vault, which is the
-- supported place for secrets consumed by pg_cron/pg_net.
--
-- Operator step (once, as postgres, after the API is deployed):
--   select vault.create_secret('https://<vercel-prod-url>', 'app.api_base');
--   select vault.create_secret('<CRON_SECRET>',            'app.cron_secret');
-- A missing secret yields NULL → a failing HTTP call, not a raised error (ruling R8 kept).

do $$
begin
  perform cron.unschedule('vaira-deadman');
exception when others then
  null;
end $$;

-- Same cadence policy as 0006: 30 s where pg_cron supports it, else once a minute.
do $$
begin
  perform cron.schedule('vaira-deadman', '30 seconds',
    $cron$ select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app.api_base' limit 1) || '/api/cron/deadman',
      headers := jsonb_build_object('authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'app.cron_secret' limit 1)),
      timeout_milliseconds := 8000) $cron$);
exception when others then
  perform cron.schedule('vaira-deadman', '* * * * *',
    $cron$ select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app.api_base' limit 1) || '/api/cron/deadman',
      headers := jsonb_build_object('authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'app.cron_secret' limit 1)),
      timeout_milliseconds := 8000) $cron$);
end $$;
