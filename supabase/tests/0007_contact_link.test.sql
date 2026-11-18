-- 0007_contact_link.test.sql — proves migration 0028.
-- The contact→profile link trigger must be SECURITY DEFINER so it links a contact
-- to a DIFFERENT user's profile by phone even under the inserting user's RLS
-- (profiles is self-only; a SECURITY INVOKER trigger could not see the other row —
-- the bug 0028 fixes). pgTAP funcs live in the extensions schema on hosted and are
-- called unqualified (search_path includes it), matching 0003_security.test.sql.
begin;
select plan(2);

-- Two auth users: aa (traveller / contact owner), bb (guardian being linked).
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','aa@test.local','x', now(),
   '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000bb','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','bb@test.local','x', now(),
   '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now());

-- bb has a phone on their profile; aa does not.
insert into profiles (id, name, phone) values
  ('00000000-0000-0000-0000-0000000000aa','Owner AA', null),
  ('00000000-0000-0000-0000-0000000000bb','Guardian BB', '+911111177328');

-- 1) the function is now SECURITY DEFINER.
select is(
  (select prosecdef from pg_proc where proname = 'link_contact_to_profile'),
  true,
  'link_contact_to_profile is SECURITY DEFINER');

-- 2) aa inserts a contact with bb's phone. aa's RLS on profiles is self-only, so a
-- SECURITY INVOKER trigger would leave linked_user_id null; the definer trigger
-- must still link it to bb.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);

insert into contacts (owner_id, name, phone, tier, position)
values ('00000000-0000-0000-0000-0000000000aa','Guardian BB','+911111177328','primary',0);

reset role;
select is(
  (select linked_user_id from contacts
     where owner_id='00000000-0000-0000-0000-0000000000aa' and phone='+911111177328'),
  '00000000-0000-0000-0000-0000000000bb'::uuid,
  'cross-user contact links to the matching profile under the inserter''s RLS');

select finish();
rollback;
