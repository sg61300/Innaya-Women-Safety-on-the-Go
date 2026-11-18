-- Tester-terms acceptance (founder ruling 2026-09-24). FILE ONLY — NOT applied to
-- the hosted project by this task; the founder applies migrations. The MVP is
-- open-tested via a public APK QR and every tester must accept the tester terms
-- before using the app; the device stores the gate locally and the app mirrors
-- the acceptance here on sign-up completion and on login when the column is null.
-- Follows the style of the existing profiles consent columns in 0001_init.sql
-- (terms_version / terms_accepted_at, consent_c7_*).

alter table profiles
  add column if not exists tester_terms_accepted_at timestamptz,
  add column if not exists tester_terms_version      text;
