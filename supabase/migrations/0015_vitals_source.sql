-- Task 24b (Q11 / ADR-016): remember which vitals source the user picked
-- (none | ble | health_connect | simulated | pendant). The brief names
-- 0003_extras.sql, but 0003 is already applied on the hosted project and applied
-- migrations are immutable (R16), so the column is added here as 0015 (lane D owns
-- 0012–0014 and 0017, lane B adds 0016; 0010 intentionally absent). Migrations are
-- files only — a lane never
-- applies them to the hosted project. The Profile → Vitals tab (Task 34) writes
-- this column; the vitals service reads the selected source at journey start.
alter table public.profiles
  add column if not exists vitals_source text not null default 'none';
