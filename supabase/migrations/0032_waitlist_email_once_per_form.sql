-- One email, once per form (founder ruling, session 33f, 2026-10-17: "Exact
-- address only", "Separate per form", "Two forms"). FILE ONLY; the founder
-- applies migrations.
--
-- Two forms share hardware_interest: the campaign page (source = 'campaign')
-- and the products form (every other source, incl. 'products:<item>' and null).
-- 0025 made email unique across the whole table, so an email used on one form
-- was "already on the list" on the other. This keys the email de-dupe on
-- (lower(email), is-campaign) instead. "Same email" stays exact, case-insensitive.
-- Loosening only: no existing row can violate the new index. Phone de-dupe is
-- unchanged. /api/waitlist needs no change: a repeat on the same form still
-- raises 23505 and returns { ok:true, duplicate:true }.

drop index if exists hardware_interest_email_uniq;

create unique index if not exists hardware_interest_email_form_uniq
  on hardware_interest (lower(email), (coalesce(source, '') = 'campaign'))
  where email is not null;
