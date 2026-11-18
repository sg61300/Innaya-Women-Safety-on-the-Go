-- Task 31: the founder replaces the placeholder region rows with local knowledge
-- before the pilot and flips founder_filled true; Task 35 QA fails a pilot build
-- if any founder_filled=false row survives. city already exists (0001_init.sql).
-- File only — never applied to the hosted project by a lane (R16).
alter table unsafe_regions add column if not exists founder_filled boolean not null default false;
