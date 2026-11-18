-- Fix (session 20, 2026-09-08). FILE ONLY — NOT applied to hosted by this task;
-- the founder applies it.
--
-- Bug: the phone-match link trigger (migration 0007, link_contact_to_profile)
-- was SECURITY INVOKER. Its `select ... from profiles where phone = new.phone`
-- therefore ran under the inserting user's RLS, and `profiles` is self-only
-- (policy profiles_self: id = auth.uid()). So when a traveller adds a guardian by
-- phone, the trigger cannot see the guardian's profile row and linked_user_id
-- stays null. No cross-user guardian link could ever form through the app path
-- (project-wide only 1 of 4 contacts was linked — a self-link, the sole case
-- self-RLS permits). This blocks the whole guardian pipeline: the monitoring push
-- (monitoring.ts::requestTier) and the cancel-confirm push (cancel-attempt) both
-- key off contacts.linked_user_id.
--
-- Fix: recreate the function as SECURITY DEFINER with a locked search_path so its
-- profile lookup bypasses RLS (the same pattern as the existing definer triggers,
-- e.g. unsafe_reports_after_insert in 0003). The body, phone match (raw new.phone,
-- limit 1) and trigger binding are otherwise identical. No new grants: the trigger
-- already runs on a contacts insert/update and needs nothing beyond reading
-- profiles, which SECURITY DEFINER grants via the function owner.

create or replace function link_contact_to_profile() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  select id into new.linked_user_id from profiles where phone = new.phone limit 1;
  return new;
end $$;

-- Trigger binding is unchanged (create or replace keeps it); re-assert for clarity.
drop trigger if exists contacts_link on contacts;
create trigger contacts_link before insert or update of phone on contacts
  for each row execute function link_contact_to_profile();

-- One-time backfill: link existing contacts whose phone matches a DIFFERENT user's
-- profile (owner_id <> profile id — self-links already work and are left alone).
-- The inner limit-1 subquery mirrors the trigger's match exactly, so a shared
-- phone resolves the same way. Idempotent via `is distinct from`. Sets only
-- linked_user_id, not phone, so this UPDATE does not re-fire the trigger.
update contacts c
set linked_user_id = m.pid
from (
  select c2.id as cid,
         (select p.id from profiles p where p.phone = c2.phone limit 1) as pid
  from contacts c2
) m
where m.cid = c.id
  and m.pid is not null
  and m.pid <> c.owner_id
  and c.linked_user_id is distinct from m.pid;

-- VERIFY (optional; run manually — do NOT uncomment in the migration). Wrap the
-- CREATE + backfill above in this transaction to see the effect and roll back:
--
--   begin;
--     select count(*) filter (where linked_user_id is not null) as linked_before,
--            count(*) as total from contacts;
--     -- ... run the create-function + backfill statements above ...
--     select count(*) filter (where linked_user_id is not null) as linked_after,
--            count(*) as total from contacts;               -- expect linked_after >= linked_before
--     select (select prosecdef from pg_proc
--             where proname = 'link_contact_to_profile') as is_security_definer;  -- expect true
--     -- spot-check a real cross-user pair now links (not a self-link):
--     select owner_id, linked_user_id, (owner_id = linked_user_id) as self_link
--       from contacts where linked_user_id is not null;
--   rollback;   -- change to commit; once satisfied
