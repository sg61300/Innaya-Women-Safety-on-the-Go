create extension if not exists postgis;
create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

create type protocol_state as enum ('IDLE','ARMED','SAFE','AMBER','EMERGENCY','CRITICAL','CANCEL_HOLD','AMBER_HOLD','RESOLVED_MONITORING','LATE_CHECK','RESOLVED');
create type contact_tier as enum ('primary','buffer');
create type region_status as enum ('amber','red','safe_by_police');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text, age int check (age between 18 and 120), occupation text, company text,
  phone text, photo_url text, how_heard text,
  self_defence_training jsonb default '{}'::jsonb, tools jsonb default '[]'::jsonb,
  terms_version text, terms_accepted_at timestamptz,
  consent_c7_training boolean not null default false, consent_c7_answered_at timestamptz,
  language text not null default 'en' check (language in ('en','hi','kn')),
  emergency_password_hash text, password_fail_count int not null default 0, locked_until timestamptz,
  word_salt text not null default encode(gen_random_bytes(16),'hex'),
  expo_push_token text, responder_opt_in boolean not null default false, phone_verified boolean not null default false,
  last_geo geography(point,4326), last_geo_at timestamptz,
  role_last_used text not null default 'user',
  created_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null, phone text not null, email text,
  tier contact_tier not null default 'primary', position int not null default 0,
  linked_user_id uuid references profiles(id), status text not null default 'invited',
  unique (owner_id, phone)
);

create table safety_words (
  owner_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('emergency','police_keyword')),
  word_hash text not null, created_at timestamptz not null default now(),
  primary key (owner_id, kind, word_hash)
);

create table journeys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  from_label text not null, to_label text not null,
  from_geo geography(point,4326) not null, to_geo geography(point,4326) not null,
  start_at timestamptz not null, eta_seconds int not null default 2700,
  mode text not null, transport jsonb default '{}'::jsonb,
  are_you_safe_word_hash text not null, selfie_url text not null,
  status text not null default 'planned', consent_version text not null, consent_c3_at timestamptz not null default now(),
  danger_zone boolean not null default false, created_at timestamptz not null default now()
);

create table journey_state (
  id bigserial primary key,
  journey_id uuid not null references journeys(id) on delete cascade,
  state protocol_state not null, reason text, changed_by text not null,
  changed_at timestamptz not null default now()
);
create index on journey_state (journey_id, changed_at desc);

create table locations (
  journey_id uuid not null references journeys(id) on delete cascade,
  ts timestamptz not null default now(), lat double precision not null, lng double precision not null,
  accuracy real, speed real, primary key (journey_id, ts)
);

create table heartbeats (
  journey_id uuid not null references journeys(id) on delete cascade,
  ts timestamptz not null default now(), battery real, battery_low boolean not null default false,
  sensors jsonb not null default '{}'::jsonb, primary key (journey_id, ts)
);

create table events (
  id bigserial primary key,
  journey_id uuid references journeys(id) on delete cascade,
  seq bigint not null default 0, ts timestamptz not null default now(),
  type text not null, payload jsonb default '{}'::jsonb, frame_url text,
  danger_score int check (danger_score between 0 and 3), model_reasons text[],
  latency_ms int, user_feedback text check (user_feedback in ('genuine','false_alarm','unsure'))
);
create index on events (journey_id, seq);

create table challenges (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references journeys(id) on delete cascade,
  reason text not null, started_at timestamptz not null default now(), deadline_at timestamptz not null,
  resolved_at timestamptz, method text, result text
);

create table monitoring_assignments (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references journeys(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  requested_at timestamptz not null default now(), responded_at timestamptz,
  response text check (response in ('accept','decline')), active boolean not null default false,
  queue_order int, last_seen_at timestamptz, unique (journey_id, contact_id)
);

create table alerts (
  id bigserial primary key,
  journey_id uuid references journeys(id) on delete cascade,
  recipient text not null, channel text not null check (channel in ('push','email','nearby','admin')),
  state protocol_state not null, sent_at timestamptz default now(), delivered_at timestamptz, error text
);

create table unsafe_regions (
  id uuid primary key default gen_random_uuid(),
  name text, city text not null default 'Delhi', centroid geography(point,4326) not null, radius_m int not null default 200,
  status region_status not null default 'amber', report_count int not null default 0,
  police_status text not null default 'unconfirmed', first_reported_at timestamptz not null default now()
);
create index on unsafe_regions using gist (centroid);

create table unsafe_reports (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references unsafe_regions(id) on delete cascade,
  reporter_id uuid not null, reason text not null, details text, time_of_day text, photo_url text,
  ts timestamptz not null default now()
);

create table blacklisted_vehicles (
  plate_norm text primary key, source text not null default 'seed', reason text, reported_at timestamptz default now()
);

create table vitals (
  owner_id uuid not null references profiles(id) on delete cascade,
  ts timestamptz not null default now(), hr int, hrv real, source text, primary key (owner_id, ts)
);

create table terms_versions (version text primary key, text_url text, published_at timestamptz default now());
insert into terms_versions (version, text_url) values ('2026-09-03-draft1', 'in-app');

insert into storage.buckets (id, name, public) values ('frames','frames',false), ('selfies','selfies',false), ('recordings','recordings',false)
on conflict do nothing;
