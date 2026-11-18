import { CANCEL_GROUP_WINDOW_MS, CANCEL_LATE_SAFE_MS, CANCEL_RESEND_AT_MS } from "@vaira/core";
import { admin } from "./supabaseAdmin";
import { sendPush, sendEmail, escapeHtml } from "./alerts";
import { notifyContactsWebPush } from "./webPush";
import { logEvent } from "./events";
import { cancelGroups, reachableContacts, CLAIM_LEASE_MS, type CancelContact } from "./cancelRetry";
import { signGuardianToken } from "./token";

// Fix lane D5 (founder Q125): after the emergency word no Safe can end the alarm (Q116). A
// guardian of hers who has spoken to her can, with a separate action. Shared by the guardian
// page (whether to show it) and the route (whether to take it), so the two cannot disagree.
// Fix lane D7 (founder Q129-Q132): with 1-3 guardians the action stays open while the alarm is
// live. With 4 or more it follows the cancel groups: from the word, group 1 has 35 min, at 30
// min the next group is alerted and has its 35 min, and so on, back to group 1 after the last.
type Db = ReturnType<typeof admin>;
export type EndCheck =
  | { ok: true; requestId: string; ownerId: string }
  | { ok: false; reason: "no_journey" | "not_her_guardian" | "not_distress" | "alarm_not_live" | "window_closed"; verdict?: string | null };
type Live =
  | { ok: true; requestId: string; ownerId: string; wordAt: number; resentAt: string | null; askPendingIds: string[] | null; askRetryAt: string | null }
  | { ok: false; reason: "no_journey" | "not_distress" | "alarm_not_live"; verdict?: string | null };

// The alarm the action can end: her newest request closed by the emergency word, on a journey
// still monitoring, in CRITICAL. The word's moment is that row's resolved_at.
export async function liveDistress(db: Db, journeyId: string): Promise<Live> {
  const { data: j } = await db.from("journeys").select("owner_id, status").eq("id", journeyId).maybeSingle();
  if (!j) return { ok: false, reason: "no_journey" };
  const ownerId = (j as { owner_id: string }).owner_id;
  const { data: req } = await db.from("cancel_requests").select("id, verdict, resolved_at, resent_at, ask_pending_ids, ask_retry_at").eq("journey_id", journeyId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const r = req as { id: string; verdict?: string | null; resolved_at?: string | null; resent_at?: string | null; ask_pending_ids?: string[] | null; ask_retry_at?: string | null } | null;
  const verdict = r?.verdict ?? null;
  if (verdict !== "distress") return { ok: false, reason: "not_distress", verdict };
  const { data: st } = await db.from("journey_state").select("state").eq("journey_id", journeyId).order("changed_at", { ascending: false }).limit(1).maybeSingle();
  if ((j as { status?: string }).status !== "monitoring" || (st as { state?: string } | null)?.state !== "CRITICAL") return { ok: false, reason: "alarm_not_live", verdict };
  return { ok: true, requestId: r!.id, ownerId, wordAt: new Date(r!.resolved_at ?? 0).getTime(), resentAt: r!.resent_at ?? null, askPendingIds: r!.ask_pending_ids ?? null, askRetryAt: r!.ask_retry_at ?? null };
}

// Pure rule. One group (1-3 guardians): always open. Otherwise the group alerted at minute 30n
// (group n, wrapping) is open until minute 30n + 35, so the last 5 min overlap the next group.
export function endOpenFor(groups: CancelContact[][], contactId: string, wordAt: number, now: number): boolean {
  if (groups.length <= 1) return true;
  const since = now - wordAt;
  if (since < 0) return false;
  const n = Math.floor(since / CANCEL_GROUP_WINDOW_MS);
  const has = (i: number) => groups[i % groups.length].some((c) => c.id === contactId);
  return has(n) || (n >= 1 && since - n * CANCEL_GROUP_WINDOW_MS <= CANCEL_LATE_SAFE_MS && has(n - 1));
}

export async function guardianEndCheck(db: Db, journeyId: string, contactId: string, now = Date.now()): Promise<EndCheck> {
  const { data: j } = await db.from("journeys").select("owner_id").eq("id", journeyId).maybeSingle();
  if (!j) return { ok: false, reason: "no_journey" };
  // Any guardian of hers, dropped group included: membership of her contacts, not of the asked list.
  const { data: c } = await db.from("contacts").select("id, linked_user_id").eq("id", contactId).eq("owner_id", (j as { owner_id: string }).owner_id).maybeSingle();
  // Owner Q116, Q125: her own account saved as one of her contacts is never a guardian here.
  if (!c || (c as { linked_user_id?: string | null }).linked_user_id === (j as { owner_id: string }).owner_id) return { ok: false, reason: "not_her_guardian" };
  const live = await liveDistress(db, journeyId);
  if (!live.ok) return live;
  // The same groups the cancel clock uses: reachable guardians, primary first, in threes.
  const groups = cancelGroups(await reachableContacts(db, live.ownerId));
  if (!endOpenFor(groups, contactId, live.wordAt, now)) return { ok: false, reason: "window_closed", verdict: "distress" };
  return { ok: true, requestId: live.requestId, ownerId: live.ownerId };
}

// Runs on the deadman tick, after the cancel clock (fix lane D7, founder Q132, Q115): with 4+
// guardians, the group whose turn it is gets the end link at its minute 0 and once more at
// minute 15. Each 15-min step is sent once: the newest row's resent_at (unused once the word
// has closed it) records the last step, claimed atomically so racing ticks send once. A step
// missed by a late tick is skipped; the current one goes out. Stops the moment the alarm is
// no longer live (ended by a guardian, her state moved, journey over).
export async function endRotationTick(now: number): Promise<{ alerted: number }> {
  const db = admin();
  let alerted = 0;
  const { data: js, error } = await db.from("journeys").select("id").eq("status", "monitoring");
  if (error) throw new Error(`journeys read failed: ${error.message}`);
  const ids = ((js ?? []) as { id: string }[]).map((x) => x.id);
  if (!ids.length) return { alerted };
  const { data: rows, error: rErr } = await db.from("cancel_requests").select("journey_id").in("journey_id", ids).eq("verdict", "distress");
  if (rErr) throw new Error(`cancel_requests read failed: ${rErr.message}`);
  for (const journeyId of new Set(((rows ?? []) as { journey_id: string }[]).map((r) => r.journey_id))) {
    try {
      const live = await liveDistress(db, journeyId);
      if (!live.ok) continue;
      const groups = cancelGroups(await reachableContacts(db, live.ownerId));
      if (groups.length <= 1) continue; // 1-3 guardians: the word's alert already went to all of them
      // F7: guardians an earlier step could not reach are resent to, alone, the way the cancel ask
      // retries its ask_pending_ids (same columns, same lease) - until they are reached - without
      // holding up the rotation. Racing ticks claim ask_retry_at atomically, so a resend goes once.
      const askPending = live.askPendingIds ?? [];
      if (askPending.length && (!live.askRetryAt || now - new Date(live.askRetryAt).getTime() >= CLAIM_LEASE_MS)) {
        const qa = db.from("cancel_requests").update({ ask_retry_at: new Date(now).toISOString() }).eq("id", live.requestId).eq("verdict", "distress");
        const { data: claimedAsk } = await (live.askRetryAt ? qa.eq("ask_retry_at", live.askRetryAt) : qa.is("ask_retry_at", null)).select("id");
        if (((claimedAsk as unknown[] | null) ?? []).length) {
          const owed = groups.flat().filter((c) => askPending.includes(c.id));
          const missedAsk = await notifyOnce(db, journeyId, owed, "She used her emergency word",
            "If you have spoken to her, you can still end the alarm.", { kind: "cancel_request" }, true);
          await db.from("cancel_requests").update({ ask_pending_ids: missedAsk }).eq("id", live.requestId).eq("verdict", "distress");
          await logEvent({ journeyId, type: "guardian_end_ask_retried", payload: { requestId: live.requestId, askedIds: askPending, missed: missedAsk } });
          alerted++;
        }
      }
      const step = Math.floor((now - live.wordAt) / CANCEL_RESEND_AT_MS);
      const sentAt = live.resentAt ? new Date(live.resentAt).getTime() : NaN;
      const sentStep = sentAt >= live.wordAt ? Math.floor((sentAt - live.wordAt) / CANCEL_RESEND_AT_MS) : -1;
      if (step < 0 || step <= sentStep) continue;
      const q = db.from("cancel_requests").update({ resent_at: new Date(now).toISOString() }).eq("id", live.requestId).eq("verdict", "distress");
      const { data: claimed } = await (live.resentAt ? q.eq("resent_at", live.resentAt) : q.is("resent_at", null)).select("id");
      if (!((claimed as unknown[] | null) ?? []).length) continue;
      const groupIndex = Math.floor(step / 2) % groups.length;
      const group = groups[groupIndex];
      const minutesLeft = Math.round((CANCEL_GROUP_WINDOW_MS + CANCEL_LATE_SAFE_MS - (step % 2) * CANCEL_RESEND_AT_MS) / 60_000);
      const missed = await notifyOnce(db, journeyId, group, "She used her emergency word",
        `If you have spoken to her, you can end the alarm in the next ${minutesLeft} minutes.`, { kind: "cancel_request" }, true);
      if (missed.length) console.error("[guardian-end] rotation guardians not reached", journeyId, missed);
      // Record who to resend to (ask_pending_ids) and reset the retry clock, like the cancel ask.
      await db.from("cancel_requests").update({ ask_pending_ids: missed, ask_retry_at: new Date(now).toISOString() }).eq("id", live.requestId).eq("verdict", "distress");
      await logEvent({ journeyId, type: "guardian_end_rotation", payload: { requestId: live.requestId, step, groupIndex, contactIds: group.map((c) => c.id), missed } });
      alerted++;
    } catch (e) {
      console.error("[guardian-end] rotation failed", journeyId, (e as Error)?.message ?? e);
    }
  }
  return { alerted };
}

// One message per guardian on one channel: the app, else a working browser, else email (the
// cancel request's order). withLink: the app push and the email carry the guardian's own page
// link; the app opens it as it opens a cancel request. Returns who no channel reached.
async function notifyOnce(db: Db, journeyId: string, to: { id: string; email: string | null; linked_user_id: string | null }[], title: string, body: string, data: Record<string, unknown>, withLink: boolean): Promise<string[]> {
  const linked = to.map((c) => c.linked_user_id).filter(Boolean) as string[];
  const { data: profs } = linked.length ? await db.from("profiles").select("id, expo_push_token").in("id", linked) : { data: [] as any[] };
  const tokenFor = new Map((profs ?? []).map((p: any) => [p.id as string, p.expo_push_token as string | null]));
  const appTok = (c: (typeof to)[number]) => (c.linked_user_id ? tokenFor.get(c.linked_user_id) ?? null : null);
  const link = (id: string) => `${process.env.APP_BASE_URL}/g/${signGuardianToken(journeyId, id)}`;
  const missed: string[] = [];
  const app = to.filter(appTok);
  if (withLink) {
    for (const c of app) if ((await sendPush([appTok(c) as string], title, body, { ...data, journeyId, link: link(c.id) })) === false) missed.push(c.id);
  } else if (app.length) await sendPush(app.map((c) => appTok(c) as string), title, body, { ...data, journeyId });
  const web = await notifyContactsWebPush(journeyId, to.filter((c) => !appTok(c)).map((c) => c.id), title, body);
  const webSent = new Set(web?.sent ?? []);
  for (const c of to) {
    if (appTok(c) || webSent.has(c.id)) continue;
    if (!c.email) { missed.push(c.id); continue; }
    // F7: one guardian's email throwing (SMTP down) must not stop the rest of the group; the one it
    // could not reach is recorded as missed so the rotation retries them, like the cancel ask.
    try {
      await sendEmail([c.email], title, withLink ? `<p>${escapeHtml(body)}</p><p><a href="${link(c.id)}">Open her live status</a></p>` : `<p>${escapeHtml(body)}</p>`);
    } catch (e) {
      console.error("[guardian-end] guardian email failed", journeyId, c.id, (e as Error)?.message);
      missed.push(c.id);
    }
  }
  return missed;
}

// One short message to every other guardian of hers, once, on one channel: the app, else a
// working browser, else email. No siren channel, nothing to nearby users. Never rejects.
export async function tellOtherGuardians(db: Db, journeyId: string, ownerId: string, enderId: string): Promise<void> {
  try {
    const { data: cs } = await db.from("contacts").select("id, name, email, linked_user_id").eq("owner_id", ownerId);
    const all = (cs ?? []) as { id: string; name: string | null; email: string | null; linked_user_id: string | null }[];
    const name = all.find((c) => c.id === enderId)?.name?.trim() || "a guardian";
    const others = all.filter((c) => c.id !== enderId);
    if (!others.length) return;
    await notifyOnce(db, journeyId, others, "Alarm ended", `Her guardian ${name} ended the alarm after speaking with her. Monitoring continues.`, { kind: "guardian_ended" }, false);
  } catch (e) {
    console.error("[guardian-end] telling the other guardians failed", journeyId, (e as Error)?.message ?? e);
    await logEvent({ journeyId, type: "alert_failed", payload: { fanout: "guardian_ended", error: (e as Error)?.message ?? String(e) } }).catch(() => undefined);
  }
}
