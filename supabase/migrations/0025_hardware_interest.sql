-- Products waitlist (hardware interest capture). FILE ONLY — NOT applied to the
-- hosted project by this task; the founder applies migrations. Follows the style
-- of 0023/0024. The public /api/waitlist route inserts via the service-role
-- client; anon may INSERT only (no read of who signed up), service-role reads.

create table if not exists hardware_interest (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null    default now(),
  name       text        not null,
  email      text,
  phone      text,
  city       text,
  product    text        not null,
  tier       text        not null,
  consent    boolean     not null,
  source     text,
  ip_hash    text,
  -- at least one contact channel must be present
  constraint hardware_interest_contact_present check (email is not null or phone is not null)
);

-- Null-safe de-dupe: partial unique indexes ignore null contact values so a row
-- with only a phone (email null) never collides with another email-null row.
create unique index if not exists hardware_interest_email_uniq
  on hardware_interest (lower(email)) where email is not null;
create unique index if not exists hardware_interest_phone_uniq
  on hardware_interest (phone) where phone is not null;

alter table hardware_interest enable row level security;

-- anon may INSERT only. No select/update/delete policy for anon => denied.
create policy hardware_interest_anon_insert on hardware_interest
  for insert to anon with check (true);

-- service_role bypasses RLS, but declare read intent explicitly for clarity.
create policy hardware_interest_service_read on hardware_interest
  for select to service_role using (true);
