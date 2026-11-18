import { assignWatchers, type WatcherInput, type WatcherPlan } from "@vaira/core";
import { admin } from "./supabaseAdmin";
import { sendPush } from "./alerts";
import { logEvent } from "./events";

const ms = (s: string | null) => (s ? new Date(s).getTime() : null);

// R47c: an EMERGENCY/CRITICAL journey is *expired*, never cancelled, once it has
// sent no heartbeat AND no frame for 15 minutes. Silence, not a person, ends it.
export const ALARM_EXPIRY_MS = 15 * 60_000;
// R47d: guardians hear the battery level once at each of these crossings.
export const BATTERY_THRESHOLDS = [20, 10] as const;

// Injectable deps for the expiry/battery fan-out (mirrors journeyState's pattern).
export interface AlarmFanoutDeps {
  db: ReturnType<typeof admin>;
  sendPush: typeof sendPush;
  logEvent: typeof logEvent;
}
const realFanoutDeps = (): AlarmFanoutDeps => ({ db: admin(), sendPush, logEvent });

// Expo push tokens of a journey's *active* (assigned) guardians.
async function activeGuardianTokens(db: AlarmFanoutDeps["db"], journeyId: string): Promise<string[]> {
  const { data: act } = await db.from("monitoring_assignments").select("contact_id").eq("journey_id", journeyId).eq("active", true);
  const ids = (act ?? []).map((a: any) => a.contact_id);
  if (!ids.length) return [];
  const { data: cs } = await db.from("contacts").select("linked_user_id").in("id", ids);
  const linked = (cs ?? []).map((c: any) => c.linked_user_id).filter(Boolean) as string[];
  if (!linked.length) return [];
  const { data: profs } = await db.from("profiles").select("expo_push_token").in("id", linked);
  return (profs ?? []).map((p: any) => p.expo_push_token).filter(Boolean) as string[];
}

const hhmm = (msAt: number) => new Date(msAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

// R47c: move a silent alarm to terminal status `expired`. No journey_state row is
// written (the last protocol state stays for the record) and NOTHING is deleted;
// the owner and every active guardian are told. Dropping out of `monitoring`
// makes the next cron tick skip it, so a second tick is a no-op (idempotent).
export async function expireSilentAlarm(journeyId: string, lastSeenAt: number | null, now: number, deps: AlarmFanoutDeps = realFanoutDeps()): Promise<void> {
  const { db, sendPush, logEvent } = deps;
  const { data: j } = await db.from("journeys").select("owner_id, profiles(name)").eq("id", journeyId).single();
  if (!j) return;
  await db.from("journeys").update({ status: "expired" }).eq("id", journeyId);
  await logEvent({ journeyId, type: "alarm_expired", payload: { last_seen: lastSeenAt ? new Date(lastSeenAt).toISOString() : null } });
  const name = ((j as any)?.profiles?.name as string | undefined)?.split(" ")[0] ?? "She";
  const { data: owner } = await db.from("profiles").select("expo_push_token").eq("id", (j as any).owner_id).maybeSingle();
  await sendPush(
    [(owner as any)?.expo_push_token].filter(Boolean) as string[],
    "Your alarm expired",
    `Your alarm expired at ${hhmm(now)} after 15 min with no signal. Open the app.`,
    { journeyId, kind: "alarm_expired" },
  );
  await sendPush(
    await activeGuardianTokens(db, journeyId),
    `${name}'s phone went silent`,
    `${name}'s phone has sent nothing for 15 min. The alarm is archived; her last location and evidence are kept. Call her or 112.`,
    { journeyId, kind: "alarm_expired" },
  );
}

// R47d: on the 20 % and 10 % crossings push the active guardians ONCE each. A
// `battery_alert` event per threshold makes it idempotent across cron ticks (the
// phone only sends the latest level; we never see the exact crossing edge).
export async function maybeBatteryPush(journeyId: string, batteryPct: number, state?: string, deps: AlarmFanoutDeps = realFanoutDeps()): Promise<number> {
  const { db, sendPush, logEvent } = deps;
  let pushed = 0;
  const { data: prior } = await db.from("events").select("payload").eq("journey_id", journeyId).eq("type", "battery_alert");
  const done = new Set((prior ?? []).map((e: any) => Number(e?.payload?.threshold)));
  for (const thr of BATTERY_THRESHOLDS) {
    if (batteryPct > thr || done.has(thr)) continue;
    const { data: j } = await db.from("journeys").select("profiles(name)").eq("id", journeyId).single();
    const name = ((j as any)?.profiles?.name as string | undefined)?.split(" ")[0] ?? "She";
    await logEvent({ journeyId, type: "battery_alert", payload: { threshold: thr, battery: batteryPct } });
    // C1-3: lite mode only applies in SAFE/RESOLVED_MONITORING (Step 3 of the
    // report); AMBER/EMERGENCY/CRITICAL are never throttled, so the guardian copy
    // must not claim monitoring went into lite mode there.
    const lite = state !== "AMBER" && state !== "EMERGENCY" && state !== "CRITICAL";
    await sendPush(
      await activeGuardianTokens(db, journeyId),
      `${name}'s battery is low`,
      `${name}'s phone is at ${batteryPct}%. ${lite ? "Monitoring is in lite mode." : "Monitoring continues."}`,
      { journeyId, kind: "battery_low" },
    );
    done.add(thr);
    pushed++;
  }
  return pushed;
}

// Recompute the watcher plan from the DB rows and write back active/queue_order.
// Requests the buffer tier when the core says so, and raises an admin alert when
// nobody is available (Task 15).
export async function reconcilePlan(journeyId: string): Promise<WatcherPlan> {
  const db = admin();
  const { data: rows } = await db
    .from("monitoring_assignments")
    .select("contact_id, requested_at, responded_at, response, last_seen_at, active, contacts(tier, linked_user_id)")
    .eq("journey_id", journeyId);
  const contacts: WatcherInput[] = (rows ?? []).map((r: any) => ({
    id: r.contact_id,
    tier: r.contacts.tier,
    response: r.response,
    respondedAt: ms(r.responded_at),
    lastSeenAt: ms(r.last_seen_at),
  }));
  const primaries = (rows ?? []).filter((r: any) => r.contacts.tier === "primary").map((r: any) => ms(r.requested_at)!);
  const requestedAt = Math.min(...primaries, Date.now());
  const bufferRows = (rows ?? []).filter((r: any) => r.contacts.tier === "buffer");
  const buffersRequestedAt = bufferRows.length ? Math.min(...bufferRows.map((r: any) => ms(r.requested_at)!)) : null;
  const plan = assignWatchers({ contacts, requestedAt, buffersRequestedAt, now: Date.now() });
  for (const r of rows ?? [])
    await db
      .from("monitoring_assignments")
      .update({ active: plan.active.includes(r.contact_id), queue_order: plan.queued.indexOf(r.contact_id) + 1 || null })
      .eq("journey_id", journeyId)
      .eq("contact_id", r.contact_id);
  if (plan.requestBuffers && buffersRequestedAt === null) await requestTier(journeyId, "buffer");
  if (plan.noneAvailable) {
    await logEvent({ journeyId, type: "no_guardian_available" });
    await db.from("alerts").insert({ journey_id: journeyId, recipient: "admin", channel: "admin", state: "AMBER" });
  }
  await logEvent({ journeyId, type: "watcher_plan", payload: plan });
  return plan;
}

// Create/refresh assignment rows for one tier and push the monitoring request to
// every linked contact in that tier.
export async function requestTier(journeyId: string, tier: "primary" | "buffer") {
  const db = admin();
  const { data: j } = await db
    .from("journeys")
    .select("owner_id, from_label, to_label, start_at, eta_seconds, profiles(name)")
    .eq("id", journeyId)
    .single();
  const { data: cs } = await db.from("contacts").select("id, linked_user_id").eq("owner_id", j!.owner_id).eq("tier", tier);
  for (const c of cs ?? [])
    await db
      .from("monitoring_assignments")
      .upsert({ journey_id: journeyId, contact_id: c.id, requested_at: new Date().toISOString() }, { onConflict: "journey_id,contact_id" });
  const linked = (cs ?? []).map((c: any) => c.linked_user_id).filter(Boolean) as string[];
  const { data: profs } = linked.length
    ? await db.from("profiles").select("expo_push_token").in("id", linked)
    : { data: [] as { expo_push_token: string | null }[] };
  const name = (j as any)?.profiles?.name ?? "Someone";
  await sendPush(
    (profs ?? []).map((p: any) => p.expo_push_token).filter(Boolean) as string[],
    `${name} is travelling soon`,
    `${j!.from_label} → ${j!.to_label}, about ${Math.round(j!.eta_seconds / 60)} min. Can you watch over her?`,
    { journeyId, kind: "monitoring_request" },
  );
}
