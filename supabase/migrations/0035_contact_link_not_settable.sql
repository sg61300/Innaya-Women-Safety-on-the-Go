-- 0035: a contact's linked account can no longer be set by hand (owner Q116, Q125).
--
-- Why: the guardian end action trusts contacts.linked_user_id to say "this signed-in account is
-- one of her guardians". The contacts_owner policy lets her account update every column, so
-- anyone holding her unlocked phone could point one of her contacts at an account they control
-- and then end an emergency-word alarm. The link must come only from the phone number match.
--
-- Change: the existing link trigger now runs on EVERY insert and update and always recomputes
-- linked_user_id from the phone, so a value sent by the client is overwritten. Same matching
-- rule as 0028. Nothing else about contacts changes. No data is changed by this file except
-- that the next update of a hand-set row puts its link back to the phone match.

create or replace function link_contact_to_profile() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  select id into new.linked_user_id from profiles where phone = new.phone limit 1;
  return new;
end $$;

drop trigger if exists contacts_link on contacts;
create trigger contacts_link before insert or update on contacts
  for each row execute function link_contact_to_profile();

-- VERIFY after applying (run manually):
--   as an owner: update contacts set linked_user_id = '<another uuid>' where id = '<her contact>';
--   select linked_user_id from contacts where id = '<her contact>';  -- equals the phone match, not the uuid

-- Owner 2026-11-11: "Do not allow self number to be saved as guardian number."
-- A contact whose phone equals its owner's own profile phone is refused (the app checks first).
create or replace function refuse_own_number_contact() returns trigger
language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  if exists (select 1 from profiles p where p.id = new.owner_id and p.phone is not null and p.phone = new.phone) then
    raise exception 'own_number_as_guardian' using errcode = 'check_violation';
  end if;
  -- Owner 2026-11-12: her own sign-in email is never a guardian's email either.
  if new.email is not null and exists (select 1 from auth.users u where u.id = new.owner_id and u.email is not null
       and lower(btrim(u.email)) = lower(btrim(new.email))) then
    raise exception 'own_email_as_guardian' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists contacts_not_own_number on contacts;
create trigger contacts_not_own_number before insert or update of phone, email, owner_id on contacts
  for each row execute function refuse_own_number_contact();

-- Rows that already break this are NOT changed here. Before applying, count them (run manually):
--   select count(*) from contacts c join profiles p on p.id = c.owner_id where p.phone = c.phone;
--   select count(*) from contacts c join auth.users u on u.id = c.owner_id where lower(btrim(u.email)) = lower(btrim(c.email));
