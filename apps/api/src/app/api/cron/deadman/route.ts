import { heartbeatVerdict } from "@vaira/core";
import { isCron } from "@/lib/auth";
import { admin } from "@/lib/supabaseAdmin";
import { applyEvent } from "@/lib/journeyState";
import { cancelRetryTick } from "@/lib/cancelRetry";
import { photoRetentionTick } from "@/lib/photoRetention";
import { endRotationTick } from "@/lib/guardianEnd";
import { ALARM_EXPIRY_MS, expireSilentAlarm, maybeBatteryPush } from "@/lib/monitoring";

// R47c: only an alarm state expires on silence; SAFE→CRITICAL is the verdict path.
const EXPIRE_STATES = new Set(["EMERGENCY", "CRITICAL"]);
// The tick sends sequentially; a run cut off mid-send is what loses or repeats alerts.
export const maxDuration = 60;

// Dead-man watchdog (Task 13). Scheduled by Supabase pg_cron every 30 s (Vercel
// Hobby crons run at most once/day, amendment 13). For each monitoring journey it
// reads the latest heartbeat + state and escalates via the server-authoritative
// applyEvent: a CRITICAL verdict → HEARTBEAT_GAP; an AMBER (battery-low) verdict on
// a still-SAFE journey → SENSOR_LOST once.
export async function GET(req: Request) {
  if (!isCron(req)) return new Response("unauthorized", { status: 401 });
  const { data, error: snapshotError } = await admin().rpc("monitoring_snapshot");
  if (snapshotError) console.error("[deadman] monitoring_snapshot failed", snapshotError.message);
  const now = Date.now();
  let escalated = 0;
  let expired = 0;
  for (const r of data ?? []) {
    if (!r.state) continue;
    const hbAt = r.last_heartbeat_at ? new Date(r.last_heartbeat_at).getTime() : null;
    // R47c expiry (C1-1). Silence is measured from the LATER of the last heartbeat,
    // the last frame, and the moment the current alarm state began, so a just-raised
    // alarm (guardian SOS, an adopted journey) with no signal yet is NOT expired on
    // the next tick. `last_frame_at` and `state_changed_at` come from
    // monitoring_snapshot only once migration 0024 is applied; while either column is
    // absent (undefined) we cannot measure silence safely, so we never expire.
    if (r.last_frame_at !== undefined && r.state_changed_at !== undefined && EXPIRE_STATES.has(r.state)) {
      const frAt = r.last_frame_at ? new Date(r.last_frame_at).getTime() : null;
      const stAt = new Date(r.state_changed_at).getTime();
      const lastSignal = Math.max(hbAt ?? 0, frAt ?? 0, stAt);
      if (now - lastSignal >= ALARM_EXPIRY_MS) {
        // One journey's failure must not cost the others their watchdog; next tick retries it.
        try {
          if (await expireSilentAlarm(r.journey_id, lastSignal || null, now)) expired++;
        } catch (e) {
          console.error("[deadman] expiry failed", r.journey_id, (e as Error)?.message);
        }
        continue; // an expired journey is neither escalated nor battery-nudged
      }
    }
    // R47d: guardian battery notice at the 20 %/10 % crossings (any journey state).
    if (r.battery != null) await maybeBatteryPush(r.journey_id, Math.round(r.battery * 100), r.state);
    if (!r.last_heartbeat_at) continue;
    const v = heartbeatVerdict({ lastHeartbeatAt: hbAt!, now, state: r.state, batteryLow: r.battery_low });
    if (v === "CRITICAL") {
      await applyEvent(r.journey_id, { type: "HEARTBEAT_GAP" }, "server_deadman");
      escalated++;
    } else if (v === "AMBER" && r.state === "SAFE") {
      await applyEvent(r.journey_id, { type: "SENSOR_LOST", sensor: "gps", batteryLow: true }, "server_deadman");
      escalated++;
    }
  }
  // Fix AD round 2: the guardian-cancel retry clock. Its failure must never cost the
  // watchdog above its response.
  const cancel = await cancelRetryTick(now).catch((e) => { console.error("[deadman] cancel tick failed", (e as Error)?.message ?? e); return { resent: 0, cycled: 0, failed: true }; });
  // Fix lane D7: with 4+ guardians, the emergency-word end link moves through the groups.
  const endRotation = await endRotationTick(now).catch((e) => { console.error("[deadman] end rotation failed", (e as Error)?.message ?? e); return { alerted: 0, failed: true }; });
  // Fix lane D6: 30-day photo deletion, last, so it never delays the watchdog above.
  const photos = await photoRetentionTick(now).catch((e) => { console.error("[deadman] photo retention failed", (e as Error)?.message ?? e); return { listed: 0, deleted: 0, failed: 1 }; });
  console.log("[deadman] checked", (data ?? []).length, "escalated", escalated, "expired", expired, "cancel", cancel, "endRotation", endRotation, "photos", photos);
  return Response.json({ checked: (data ?? []).length, escalated, expired, cancel, endRotation, photos });
}

// pg_cron/pg_net call this with net.http_post (migration 0006/0011); Vercel cron would use GET.
export { GET as POST };
