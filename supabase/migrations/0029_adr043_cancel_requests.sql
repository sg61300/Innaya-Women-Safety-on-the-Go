-- ADR-043 (session 23): guardian-approved cancel + SOS mode choice.
-- FILE ONLY — NOT applied to the hosted project by this lane. The founder applies
-- it (`node scripts/db/apply-migration.mjs`). Never edit an existing migration
-- (s12 dispatch addendum); this lands as a new file.
--
-- The ADR-014 two-password + 360°-call cancel is retired. A cancel now opens a
-- request to up to 3 guardians who vote Safe / Not safe; the first Safe cancels,
-- 2+ Not safe keep (or re-raise) the alarm. The wearer also chooses an alarm mode
-- (siren | silent) at the SOS tap.

-- 1. The alarm mode the wearer picked for a self-raised alarm. Distinct from the
--    existing journeys.mode (transport). Default 'siren' (ADR-013 behaviour).
alter table journeys add column if not exists alarm_mode text not null default 'siren'
  check (alarm_mode in ('siren','silent'));

-- 2. One open/closed cancel request per "Not an emergency" run. method = the path
--    the wearer took to it (journey word, or the Forgot-it photo/video). media_path
--    points into the private selfies bucket (cancel/<journeyId>/<requestId>.<ext>).
--    asked_contact_ids = the (<=3) guardians the server asked, in tier order.
create table cancel_requests (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references journeys(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  method text not null check (method in ('word','photo','video')),
  media_path text,
  asked_contact_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  verdict text check (verdict in ('cancel','keep','reraise','pending'))
);
create index on cancel_requests (journey_id, created_at desc);

-- 3. One vote per asked guardian. unique(request_id, contact_id) makes a double
--    vote idempotent (the server upserts / ignores the conflict).
create table cancel_votes (
  request_id uuid not null references cancel_requests(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  safe boolean not null,
  created_at timestamptz not null default now(),
  unique (request_id, contact_id)
);
create index on cancel_votes (request_id, created_at);

-- 4. RLS. The owner reads their own requests and the votes on them (the wearer's
--    phone watches both over realtime). Votes are written ONLY by the signed-link
--    server route under the service role, which bypasses RLS — there is therefore
--    no client insert policy on cancel_votes. An owner-insert policy on requests is
--    kept as defence in depth even though the route uses the service role.
alter table cancel_requests enable row level security;
alter table cancel_votes enable row level security;

create policy cancel_requests_owner_read on cancel_requests for select
  using (owner_id = auth.uid());
create policy cancel_requests_owner_insert on cancel_requests for insert
  with check (owner_id = auth.uid()
    and exists (select 1 from journeys j where j.id = journey_id and j.owner_id = auth.uid()));

create policy cancel_votes_owner_read on cancel_votes for select
  using (exists (
    select 1 from cancel_requests r join journeys j on j.id = r.journey_id
    where r.id = request_id and j.owner_id = auth.uid()));

grant select on cancel_requests to authenticated;
grant select on cancel_votes to authenticated;

-- 5. Realtime: the wearer's phone subscribes to both tables to see the verdict.
alter publication supabase_realtime add table cancel_requests;
alter publication supabase_realtime add table cancel_votes;

-- 6. Fix: cancel_calls.contact_id (migration 0022) had no ON DELETE action, so a
--    contact row could not be deleted while a cancel_calls row referenced it —
--    this blocked account deletion on hosted (2026-09-12; read-only proof: 4 rows).
--    Re-point the FK to ON DELETE CASCADE, matching cancel_votes above.
alter table cancel_calls drop constraint if exists cancel_calls_contact_id_fkey;
alter table cancel_calls add constraint cancel_calls_contact_id_fkey
  foreign key (contact_id) references contacts(id) on delete cascade;
