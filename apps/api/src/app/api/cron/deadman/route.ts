import { heartbeatVerdict } from "@vaira/core";
import { isCron } from "@/lib/auth";
import { admin } from "@/lib/supabaseAdmin";
import { applyEvent } from "@/lib/journeyState";
import { ALARM_EXPIRY_MS, expireSilentAlarm, maybeBatteryPush } from "@/lib/monitoring";

// R47c: only an alarm state expires on silence; SAFE→CRITICAL is the verdict path.
const EXPIRE_STATES = new Set(["EMERGENCY", "CRITICAL"]);

// Dead-man watchdog (Task 13). Scheduled by Supabase pg_cron every 30 s (Vercel
// Hobby crons run at most once/day, amendment 13). For each monitoring journey it
// reads the latest heartbeat + state and escalates via the server-authoritative
// applyEvent: a CRITICAL verdict → HEARTBEAT_GAP; an AMBER (battery-low) verdict on
// a still-SAFE journey → SENSOR_LOST once.
export async function GET(req: Request) {
  if (!isCron(req)) return new Response("unauthorized", { status: 401 });
  const { data } = await admin().rpc("monitoring_snapshot");
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
        await expireSilentAlarm(r.journey_id, lastSignal || null, now);
        expired++;
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
  console.log("[deadman] checked", (data ?? []).length, "escalated", escalated, "expired", expired);
  return Response.json({ checked: (data ?? []).length, escalated, expired });
}

// pg_cron/pg_net call this with net.http_post (migration 0006/0011); Vercel cron would use GET.
export { GET as POST };
