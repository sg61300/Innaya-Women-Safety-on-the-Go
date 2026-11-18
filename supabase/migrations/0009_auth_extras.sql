-- Task 17 (Auth screens) SQL additions. R16: this file is written but NOT applied
-- by the screens lane — the orchestrator applies it after merge.
--
-- `journeys.ending` and the base `profiles` columns already exist (0001, 0005),
-- so this migration only adds what Task 17 introduces: admin/delete-request
-- columns, phone -> email lookup, the new-user profile trigger, and the dev-only
-- E2E confirm RPC that V13's onboarding flow relies on.

-- Admin flag + soft delete-request marker on profiles.
alter table profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists delete_requested_at timestamptz;

-- Login-by-phone: resolve the auth email for a verified phone number.
create or replace function email_for_phone(p_phone text) returns text
  language sql security definer
  set search_path = public
as $$
  select u.email from auth.users u
  join profiles p on p.id = u.id
  where p.phone = p_phone
  limit 1
$$;

-- D1 (s09 security): a SECURITY DEFINER function is EXECUTE-able by PUBLIC by
-- default, which would let anon/authenticated turn any phone number into that
-- woman's email. Lock it to service_role only; the client no longer calls it
-- (login.tsx phone path is disabled until server-side phone login, Day 3+).
revoke execute on function email_for_phone(text) from public, anon, authenticated;

-- Create the profile row when a new auth user signs up, carrying the phone from
-- the signup metadata.
create or replace function handle_new_user() returns trigger
  language plpgsql security definer
  set search_path = public
as $$
begin
  insert into profiles (id, phone)
  values (new.id, new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- V13/R22 dev-only E2E confirm: marks the auth user confirmed so the Maestro
-- onboarding flow can proceed with code 000000.
-- D2 (s09, R26): Supabase forbids custom GUCs, so a current_setting('app.e2e')
-- guard could never be turned on and V13 onboarding would be blocked. Read the
-- flag from Supabase Vault instead — same pattern migration 0011 uses for
-- app.api_base / app.cron_secret. Enable on a dev project with:
--   select vault.create_secret('on', 'e2e_enabled');
create or replace function e2e_confirm(email text) returns void
  language plpgsql security definer
  set search_path = public
as $$
begin
  if (select decrypted_secret from vault.decrypted_secrets where name = 'e2e_enabled' limit 1)
       is distinct from 'on' then
    raise exception 'e2e_confirm disabled';
  end if;
  update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now())
    where lower(email) = lower(e2e_confirm.email);
end
$$;
