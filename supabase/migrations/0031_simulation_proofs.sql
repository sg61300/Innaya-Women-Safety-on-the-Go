-- Simulation proof ledger (Lane E3 / X5a, founder ruling 2026-09-24). FILE ONLY —
-- NOT applied to the hosted project by this task; the founder applies migrations.
-- POST /api/simulate-proof writes one row per practice-proof email it sends. The
-- row is ALSO the rate-limit ledger (max 5 per user per hour): Vercel is stateless
-- so an in-memory counter cannot hold across invocations. This table never
-- references cancel_requests / cancel_votes / alerts / contacts — a simulation
-- must never touch a guardian path.
--
-- Service-role only: the route uses the admin() client. RLS is enabled with NO
-- policy for `authenticated`, so no tester can read another tester's simulation
-- rows from the client. Follows the style of 0030_tester_terms.sql (file only).

create table if not exists simulation_proofs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  media_path  text not null,
  created_at  timestamptz not null default now()
);

create index if not exists simulation_proofs_user_created
  on simulation_proofs (user_id, created_at desc);

alter table simulation_proofs enable row level security;
-- No policy is granted → only the service role (admin client) can read/write.
