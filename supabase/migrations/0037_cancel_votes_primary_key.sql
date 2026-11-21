-- 0037: cancel_votes gets a primary key (founder 2026-11-14, "Add a primary key").
--
-- Why: cancel_votes is in the supabase_realtime publication (0029:68), which publishes deletes,
-- but the table has no primary key, so it has no replica identity. Postgres then refuses EVERY
-- delete on it, including the cascade from contacts, cancel_requests and journeys, even when no
-- vote row matches. Seen on hosted 2026-11-14:
--   ERROR 55000: cannot delete from table "cancel_votes" because it does not have a replica
--   identity and publishes deletes
-- Effect in production: removing a guardian in the app (profile.ts prune), deleting a journey or
-- an account fails.
--
-- Change: the existing unique pair (request_id, contact_id), both NOT NULL, becomes the primary
-- key. The default replica identity is the primary key, so deletes work and realtime keeps
-- streaming. No data changes. The old unique constraint stays (the vote upsert's onConflict
-- "request_id,contact_id" works with either).
alter table cancel_votes add primary key (request_id, contact_id);

-- VERIFY after applying (run manually):
--   select relreplident from pg_class where relname = 'cancel_votes';   -- 'd' (default = primary key)
--   select conname from pg_constraint where conrelid = 'cancel_votes'::regclass and contype = 'p';  -- one row
