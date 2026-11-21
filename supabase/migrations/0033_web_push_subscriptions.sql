-- Browser (PWA) notifications for guardians without the app (founder Q101, Q105).
-- FILE ONLY: not applied to the hosted project by this lane.
--
-- One row per browser per guardian contact. Written and read only by the server under
-- the service role, which bypasses RLS. RLS is on with no policies and the client
-- roles hold no privileges, so there is no public read or write. Removing a contact
-- removes their subscriptions.
create table web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (contact_id, endpoint)
);

alter table web_push_subscriptions enable row level security;
revoke all on web_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on web_push_subscriptions to service_role;
