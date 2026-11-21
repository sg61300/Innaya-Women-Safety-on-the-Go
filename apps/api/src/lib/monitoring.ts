import { assignWatchers, type WatcherInput, type WatcherPlan } from "@vaira/core";
import { admin } from "./supabaseAdmin";
import { sendPush, sendEmail, escapeHtml } from "./alerts";
import { logEvent } from "./events";
import { notifyContactsWebPush } from "./webPush";
import { cancelPhoneStopped } from "./cancelRetry";

const ms = (s: string | null) => (s ? new Date(s).getTime() : null);

// R47c: an EMERGENCY/CRITICAL journey is *expired*, never cancelled, once it has
// sent no heartbeat AND no frame for 15 minutes. Silence, not a person, ends it.
export const ALARM_EXPIRY_MS = 15 * 60_000;
// R47d: guardians hear the battery level once at each of these crossings.
export const BATTERY_THRESHOLDS = [20, 10] as const;
// The silent-alarm sends may hold the status flip this long. Under the 30 s cron tick, so
// a hung mail server cannot make every tick alert the guardians again.
const EXPIRY_SEND_BUDGET_MS = 20_000;
// How soon a guardian the silent-alarm message did not reach is tried again.
const EXPIRY_RETRY_MS = 2 * 60_000;

// Injectable deps for the expiry/battery fan-out (mirrors journeyState's pattern).
export interface AlarmFanoutDeps {
  db: ReturnType<typeof admin>;
  sendPush: typeof sendPush;
  logEvent: typeof logEvent;
  webPushActiveGuardians?: typeof webPushActiveGuardians;
}
const realFanoutDeps = (): AlarmFanoutDeps => ({ db: admin(), sendPush, logEvent, webPushActiveGuardians });

// Browser notification for the active guardians who have no app. Never rejects.
async function webPushActiveGuardians(journeyId: string, title: string, body: string): Promise<void> {
  try {
    const { data: act } = await admin().from("monitoring_assignments").select("contact_id").eq("journey_id", journeyId).eq("active", true);
    await notifyContactsWebPush(journeyId, (act ?? []).map((a: any) => a.contact_id), title, body);
  } catch (e) {
    console.error("[web-push] active guardian read failed", (e as Error)?.message ?? e);
  }
}

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

// Runs labelled sends side by side within the budget. Never rejects; returns the labels
// that failed or had not finished, so what was missed can be logged.
async function settleWithin(jobs: [string, Promise<unknown>][]): Promise<string[]> {
  const done = new Set<string>();
  const all = Promise.all(jobs.map(([label, p]) => p.then(
    (r) => { if (r !== false) done.add(label); },
    (e) => console.error("[expiry] send failed", label, (e as Error)?.message),
  )));
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([all, new Promise((res) => { timer = setTimeout(res, EXPIRY_SEND_BUDGET_MS); })]);
  clearTimeout(timer);
  return jobs.map(([label]) => label).filter((l) => !done.has(l));
}

// R47c + founder Q115: no correct word and the phone stops working: every guardian is told,
// once, on one channel: the app, else a working browser, else email. No cancel request. The
// alarm goes to terminal status `expired`; no journey_state row, nothing deleted. The status
// flips LAST, so a run cut off mid-way is redone by the next tick instead of losing the
// sends; after the flip the cron skips it. Founder Q113: with a cancel waiting (correct word
// given) none of this runs and the status stays, see cancelPhoneStopped. ChatGPT 6: a guardian
// not reached is retried, alone, and the status waits for them. Founder Q120: after a closed
// request nothing ends the alarm automatically: guardians are told, the status stays, and only
// her SOS or an admin ends it. Returns whether the alarm expired.
export async function expireSilentAlarm(journeyId: string, lastSeenAt: number | null, now: number, deps: AlarmFanoutDeps = realFanoutDeps()): Promise<boolean> {
  const { db, sendPush, logEvent } = deps;
  const { data: j } = await db.from("journeys").select("owner_id, profiles(name)").eq("id", journeyId).single();
  if (!j) return false;
  const { data: lastReq } = await db.from("cancel_requests").select("id, resolved_at, verdict").eq("journey_id", journeyId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const req = lastReq as { resolved_at?: string | null; verdict?: string | null } | null;
  if (req && !req.resolved_at) {
    await cancelPhoneStopped(journeyId, now);
    return false;
  }
  const staysOn = req?.verdict === "distress" || req?.verdict === "keep" || req?.verdict === "reraise";
  const ownerId = (j as any).owner_id;
  const name = ((j as any)?.profiles?.name as string | undefined)?.split(" ")[0] ?? "She";
  const jobs: [string, Promise<unknown>][] = [];
  const { data: owner } = await db.from("profiles").select("expo_push_token").eq("id", ownerId).maybeSingle();
  const { data: contacts, error: cErr } = await db.from("contacts").select("id, email, linked_user_id").eq("owner_id", ownerId);
  if (cErr) throw new Error(`contacts read failed: ${cErr.message}`); // stays in monitoring; next tick tries again
  const all = (contacts ?? []) as { id: string; email: string | null; linked_user_id: string | null }[];
  const linked = all.map((c) => c.linked_user_id).filter(Boolean) as string[];
  const { data: profs } = linked.length ? await db.from("profiles").select("id, expo_push_token").in("id", linked) : { data: [] as any[] };
  const tokenFor = new Map((profs ?? []).map((p: any) => [p.id, p.expo_push_token as string | null]));
  const hasApp = (c: { linked_user_id: string | null }) => !!(c.linked_user_id && tokenFor.get(c.linked_user_id));
  // What earlier runs already did, so a retry repeats nothing to anyone already told.
  const { data: prior } = await db.from("events").select("payload, ts").eq("journey_id", journeyId).eq("type", "alarm_silent_progress");
  const allRuns = (Array.isArray(prior) ? prior : []) as { payload?: { reached?: string[]; owner?: boolean }; ts?: string }[];
  // F8 (founder "Tell every time"): only THIS silence counts. A send made before her last signal
  // belongs to an earlier silence; the phone has gone quiet again since, so her guardians are told
  // again. Within one silence the sends below still debounce and never repeat to anyone already told.
  const runs = allRuns.filter((x) => lastSeenAt == null || new Date(x.ts ?? 0).getTime() > lastSeenAt);
  if (runs.length && now - Math.max(...runs.map((x) => new Date(x.ts ?? 0).getTime())) < EXPIRY_RETRY_MS) return false;
  const told = new Set(runs.flatMap((x) => x.payload?.reached ?? []));
  const todo = all.filter((c) => !told.has(c.id));
  if (staysOn && runs.length && !todo.length) return false; // told once this silence; nothing more until she acts
  if (!staysOn && !runs.some((x) => x.payload?.owner)) jobs.push(["owner", sendPush(
    [(owner as any)?.expo_push_token].filter(Boolean) as string[],
    "Your alarm expired",
    `Your alarm expired at ${hhmm(now)} after 15 min with no signal. Open the app.`,
    { journeyId, kind: "alarm_expired" },
  )]);
  const title = `${name}'s phone went silent`;
  const body = `${name}'s phone has sent nothing for 15 min. ${staysOn ? "The alarm stays on" : "The alarm is archived"}; her last location and evidence are kept. Call her or 112.`;
  jobs.push(["app", sendPush(todo.filter(hasApp).map((c) => tokenFor.get(c.linked_user_id!) as string), title, body, { journeyId, kind: "alarm_expired" })]);
  const web = await notifyContactsWebPush(journeyId, todo.map((c) => c.id), title, body); // never rejects
  const webSent = new Set(web?.sent ?? []);
  const webFailed = new Set(web?.failed ?? []);
  const mail = todo.filter((c) => c.email && !hasApp(c) && !webSent.has(c.id));
  for (const c of mail) jobs.push([`email:${c.id}`, sendEmail([c.email!], title, `<p>${escapeHtml(body)}</p>`)]);
  const missed = await settleWithin(jobs);
  const failed = new Set(missed);
  // A guardian is owed a retry only if a channel they have failed. With none at all there is
  // nothing to retry; that is the "can be asked" check's concern, not this message's.
  const notTold = todo.filter((c) => {
    if (webSent.has(c.id)) return false;
    if (hasApp(c)) return failed.has("app");
    if (c.email) return failed.has(`email:${c.id}`);
    return webFailed.has(c.id);
  }).map((c) => c.id);
  await logEvent({ journeyId, type: "alarm_silent_progress", payload: { reached: todo.map((c) => c.id).filter((id) => !notTold.includes(id)), owner: !failed.has("owner") && !staysOn, notTold } });
  if (missed.length || notTold.length) {
    console.error("[expiry] guardians not reached", journeyId, missed, notTold);
    await logEvent({ journeyId, type: "alert_failed", payload: { fanout: "alarm_expired", missed, notTold } });
  }
  if (notTold.length) return false; // not marked done: the next tick tries them again
  if (staysOn) {
    await logEvent({ journeyId, type: "alarm_silent_all_told", payload: { last_seen: lastSeenAt ? new Date(lastSeenAt).toISOString() : null, contacts: all.map((c) => c.id) } });
    return false;
  }
  await db.from("journeys").update({ status: "expired" }).eq("id", journeyId);
  await logEvent({ journeyId, type: "alarm_expired", payload: { last_seen: lastSeenAt ? new Date(lastSeenAt).toISOString() : null } });
  await logEvent({ journeyId, type: "alarm_expired_all_guardians", payload: { contacts: all.map((c) => c.id), missed } });
  return true;
}

// R47d: on the 20 % and 10 % crossings push the active guardians ONCE each. A
// `battery_alert` event per threshold makes it idempotent across cron ticks (the
// phone only sends the latest level; we never see the exact crossing edge).
export async function maybeBatteryPush(journeyId: string, batteryPct: number, state?: string, deps: AlarmFanoutDeps = realFanoutDeps()): Promise<number> {
  const { db, sendPush, logEvent, webPushActiveGuardians } = deps;
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
    const batteryTitle = `${name}'s battery is low`;
    const batteryBody = `${name}'s phone is at ${batteryPct}%. ${lite ? "Monitoring is in lite mode." : "Monitoring continues."}`;
    const batteryWeb = webPushActiveGuardians?.(journeyId, batteryTitle, batteryBody);
    await sendPush(await activeGuardianTokens(db, journeyId), batteryTitle, batteryBody, { journeyId, kind: "battery_low" });
    await batteryWeb;
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
  const requestTitle = `${name} is travelling soon`;
  const requestBody = `${j!.from_label} → ${j!.to_label}, about ${Math.round(j!.eta_seconds / 60)} min. Can you watch over her?`;
  const requestWeb = notifyContactsWebPush(journeyId, (cs ?? []).map((c: any) => c.id), requestTitle, requestBody);
  await sendPush(
    (profs ?? []).map((p: any) => p.expo_push_token).filter(Boolean) as string[],
    requestTitle,
    requestBody,
    { journeyId, kind: "monitoring_request" },
  );
  await requestWeb;
}
