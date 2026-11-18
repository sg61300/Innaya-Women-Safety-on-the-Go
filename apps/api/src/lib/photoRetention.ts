import { admin } from "./supabaseAdmin";

// Fix lane D6 (founder Q127): trip photos are deleted 30 days after they were taken.
// Fix lane D7 (founder Q133): trip videos too.
// Migration 0034 lists what may go (and leaves out a live alarm's photos); this file
// deletes them through the Storage API, a bounded batch per deadman tick.
export const PHOTO_RETENTION_MS = 30 * 24 * 60 * 60_000;
export const RETENTION_BATCH = 200;
// The deadman tick runs every 30 s; deletion runs only in this UTC hour
// (02:30 to 03:29 India time), up to RETENTION_BATCH photos per tick.
export const RETENTION_HOUR_UTC = 21;

// The same patterns as migration 0034, checked again here so a wrong row from the
// database can never delete her profile photo or anything else not listed.
// Fix lane D7 (founder Q133): photos AND videos: cancel proof videos, ARE-YOU-SAFE check
// selfies and practice-run proofs too.
const DELETABLE: Record<string, RegExp[]> = {
  frames: [/^[0-9a-f-]{36}\/[0-9]+\.jpg$/],
  selfies: [
    /^[0-9a-f-]{36}\/[0-9]+-[0-9a-z]+\.jpg$/,
    /^[0-9a-f-]{36}\/cancel\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|mp4)$/,
    /^[0-9a-f-]{36}\/challenge-[0-9a-f-]{36}-[0-9]+\.jpg$/,
    /^simulation\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|mp4)$/,
  ],
};
export function isRetentionTarget(bucket: string, name: string): boolean {
  return (DELETABLE[bucket] ?? []).some((re) => re.test(name));
}

export const retentionDue = (now: number) => new Date(now).getUTCHours() === RETENTION_HOUR_UTC;

type Row = { bucket_id: string; name: string; created_at: string };
export type RetentionResult = { listed: number; deleted: number; failed: number; skipped?: boolean };

// Safe to re-run: a deleted object is no longer listed. A failure is logged and the
// photos stay listed, so the next tick retries them.
export async function photoRetentionTick(now: number, db = admin()): Promise<RetentionResult> {
  if (!retentionDue(now)) return { listed: 0, deleted: 0, failed: 0, skipped: true };
  const before = now - PHOTO_RETENTION_MS;
  const { data, error } = await db.rpc("photo_retention_candidates", { p_before: new Date(before).toISOString(), p_limit: RETENTION_BATCH });
  if (error) {
    console.error("[photoRetention] list failed", error.message);
    return { listed: 0, deleted: 0, failed: 1 };
  }
  const rows = ((data ?? []) as Row[]).filter(
    (r) => isRetentionTarget(r.bucket_id, r.name) && new Date(r.created_at).getTime() < before,
  );
  const byBucket = new Map<string, string[]>();
  for (const r of rows) byBucket.set(r.bucket_id, [...(byBucket.get(r.bucket_id) ?? []), r.name]);
  let deleted = 0;
  let failed = 0;
  for (const [bucket, names] of byBucket) {
    // One bucket's failure must not cost the other its turn.
    try {
      const { data: gone, error: rmErr } = await db.storage.from(bucket).remove(names);
      if (rmErr) throw rmErr;
      deleted += gone?.length ?? 0;
    } catch (e) {
      failed += names.length;
      console.error("[photoRetention] delete failed", bucket, names.length, (e as Error)?.message ?? e);
    }
  }
  console.log("[photoRetention] listed", (data ?? []).length, "deleted", deleted, "failed", failed);
  return { listed: (data ?? []).length, deleted, failed };
}
