-- Task 29b (ADR-014 gates 2-3): the cancel-flow call channel.
-- A guardian verdict on the CRITICAL cancel is written here (service role only,
-- from /api/cancel-confirm) and reaches the traveller's phone over realtime, so a
-- de-escalation the runner would otherwise never adopt (server states only ever
-- rank UP) is applied locally when the row's result arrives.
create table cancel_calls (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references journeys(id) on delete cascade,
  contact_id uuid references contacts(id),
  started_at timestamptz not null default now(),
  result text check (result in ('safe','wrong','failed')),
  resulted_at timestamptz
);
create index on cancel_calls (journey_id, started_at desc);
alter table cancel_calls enable row level security;
-- owner and the guardian linked to the row's contact may read; nobody writes from the client (service role only)
create policy cancel_calls_read on cancel_calls for select using (
  exists (select 1 from journeys j where j.id = journey_id and j.owner_id = auth.uid())
  or exists (select 1 from contacts c where c.id = contact_id and c.linked_user_id = auth.uid()));
grant select on cancel_calls to authenticated;
alter publication supabase_realtime add table cancel_calls;
