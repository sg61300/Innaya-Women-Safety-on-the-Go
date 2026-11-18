-- 0037: deleting a contact that has a vote now works and removes its vote (cascade); a contact
-- with no vote can be deleted too. Written, NOT run here; run after 0037 is applied.
begin;
set local role postgres;
select plan(4);

insert into auth.users (id) values ('00000000-0000-0000-0000-000000037001') on conflict do nothing;
insert into profiles (id) values ('00000000-0000-0000-0000-000000037001') on conflict do nothing;
insert into journeys (id, owner_id, from_label, to_label, from_geo, to_geo, start_at, eta_seconds, mode, are_you_safe_word_hash, selfie_url, status, consent_version) values
  ('00000000-0000-0000-0000-000000037a01', '00000000-0000-0000-0000-000000037001', 'a', 'b', 'SRID=4326;POINT(77.2 28.6)', 'SRID=4326;POINT(77.3 28.7)', now(), 1800, 'cab', 'h', 'u', 'done', 'v1');
insert into contacts (id, owner_id, name, phone) values
  ('00000000-0000-0000-0000-000000037c01', '00000000-0000-0000-0000-000000037001', 'g1', '+910000037001'),
  ('00000000-0000-0000-0000-000000037c02', '00000000-0000-0000-0000-000000037001', 'g2', '+910000037002');
insert into cancel_requests (id, journey_id, owner_id, method, asked_contact_ids) values
  ('00000000-0000-0000-0000-000000037e01', '00000000-0000-0000-0000-000000037a01', '00000000-0000-0000-0000-000000037001', 'word',
   array['00000000-0000-0000-0000-000000037c01']::uuid[]);
insert into cancel_votes (request_id, contact_id, safe) values
  ('00000000-0000-0000-0000-000000037e01', '00000000-0000-0000-0000-000000037c01', true);

select is((select relreplident::text from pg_class where relname = 'cancel_votes'), 'd', 'replica identity is the primary key');
select lives_ok($$ delete from contacts where id = '00000000-0000-0000-0000-000000037c01' $$, 'a contact with a vote can be deleted');
select is((select count(*)::int from cancel_votes where contact_id = '00000000-0000-0000-0000-000000037c01'), 0, 'its vote went with it');
select lives_ok($$ delete from contacts where id = '00000000-0000-0000-0000-000000037c02' $$, 'a contact with no vote can be deleted');

select * from finish();
rollback;
