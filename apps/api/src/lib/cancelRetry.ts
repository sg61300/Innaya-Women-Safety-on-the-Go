import { CANCEL_GROUP_WINDOW_MS, CANCEL_RESEND_AT_MS } from "@vaira/core";
import { admin } from "./supabaseAdmin";
import { sendPush, sendEmail, escapeHtml } from "./alerts";
import { logEvent } from "./events";
import { notifyContactsWebPush } from "./webPush";
import { signCancelVoteToken, signGuardianToken } from "./token";

// Fix AD round 2 (founder Q95, Q98, Q100, Q101): one cancel_requests row is one
// 30-minute cycle for one group of up to 3 guardians. The row's created_at is the start
// of the window. rolled_at marks a row the clock no longer drives, so that group gets no
// more requests; its votes stay valid until cancelSafeOpen says no.
export const GROUP_SIZE = 3;
// A claim older than this belongs to a run that was cut off: the cron route's limit is
// 60 s, so no live run can still hold it. It is also how often a missed resend retries.
export const CLAIM_LEASE_MS = 2 * 60_000;
// The same 15 min as ALARM_EXPIRY_MS: no signal this long means the phone has stopped.
const PHONE_SILENT_MS = 15 * 60_000;
// Oldest first, within the cron route's 60 s; what is left is still due on the next tick.
const TICK_BUDGET_MS = 40_000;

type Db = ReturnType<typeof admin>;
export type CancelContact = { id: string; email: string | null; linked_user_id: string | null; tier?: string | null; position?: number | null };
type Labels = { from_label?: unknown; to_label?: unknown };
type RequestRow = {
  id: string; journey_id: string; owner_id: string; method: string; media_path: string | null;
  asked_contact_ids: string[]; created_at: string; resent_at?: string | null; group_index?: number | null;
  rolled_at?: string | null; resend_pending_ids?: string[] | null; phone_stage?: PhoneStage | null;
  ask_pending_ids?: string[] | null; ask_retry_at?: string | null;
};
const ROW_COLUMNS = "id, journey_id, owner_id, method, media_path, asked_contact_ids, created_at, resent_at, group_index, rolled_at, resend_pending_ids, phone_stage, ask_pending_ids, ask_retry_at";
// Founder Q113: the phone stopped after the correct word. "first": the first group has been
// told. "all": every guardian has been asked. The normal moving clock is paused on such a row.
type PhoneStage = "first" | "all";

const tierRank = (t?: string | null) => (t === "primary" ? 0 : 1);

// Primary tier before buffer, then position. reachableContacts has already decided who can be
// asked, so a guardian with only a browser subscription stays in.
export function cancelGroups<T extends CancelContact>(contacts: T[]): T[][] {
  const sorted = [...contacts]
    .sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || (a.position ?? 0) - (b.position ?? 0));
  const groups: T[][] = [];
  for (let i = 0; i < sorted.length; i += GROUP_SIZE) groups.push(sorted.slice(i, i + GROUP_SIZE));
  return groups;
}

// Founder Q111: only a guardian who can really get a message counts: an email, an app with
// a push token, or a browser subscription. A linked account alone reaches nobody.
export async function reachableContacts(db: Db, ownerId: string): Promise<CancelContact[]> {
  const contacts = await contactsOf(db, ownerId);
  const linked = contacts.map((c) => c.linked_user_id).filter(Boolean) as string[];
  const ids = contacts.map((c) => c.id);
  const { data: profs, error: pErr } = linked.length ? await db.from("profiles").select("id, expo_push_token").in("id", linked) : { data: [], error: null };
  const { data: subs, error: sErr } = ids.length ? await db.from("web_push_subscriptions").select("contact_id").in("contact_id", ids) : { data: [], error: null };
  if (pErr) throw new Error(`reachable read failed: ${pErr.message}`);
  // E.g. the code deployed before migration 0033. The word and the clock go on with email and app.
  if (sErr) console.error("[cancel-retry] browser subscription read failed", sErr.message);
  const withToken = new Set(((profs ?? []) as { id: string; expo_push_token: string | null }[]).filter((p) => p.expo_push_token).map((p) => p.id));
  const withBrowser = new Set(((subs ?? []) as { contact_id: string }[]).map((s) => s.contact_id));
  return contacts.filter((c) => !!c.email || withBrowser.has(c.id) || (!!c.linked_user_id && withToken.has(c.linked_user_id)));
}

// Asks a group on the NORMAL channel with each guardian's own vote link (never the loud
// alarm channel). appOnly = the resend (founder Q101): app guardian the app; no-app guardian
// the browser only; the email only when neither reached them, so nobody gets nothing. One
// failed send never stops the next guardian. Returns and logs the contacts not reached.
export async function askGroup(db: Db, journeyId: string, requestId: string, labels: Labels, group: CancelContact[], appOnly: boolean): Promise<string[]> {
  const base = process.env.APP_BASE_URL;
  const linkedIds = group.map((c) => c.linked_user_id).filter(Boolean) as string[];
  const { data: profs } = linkedIds.length
    ? await db.from("profiles").select("id, expo_push_token").in("id", linkedIds)
    : { data: [] as { id: string; expo_push_token: string | null }[] };
  const tokenFor = new Map((profs ?? []).map((p: any) => [p.id, p.expo_push_token]));
  // Browser notification for a guardian without the app (founder Q101). Never rejects.
  const web = await notifyContactsWebPush(journeyId, group.map((c) => c.id), "Is she safe? She's trying to cancel the alarm", "Open INNAYA to confirm she's safe or keep the alarm on.", (id) => `?cr=${requestId}&vt=${signCancelVoteToken(requestId, id)}`);
  const webSent = new Set(web?.sent ?? []);
  const missed: string[] = [];
  for (const c of group) {
    let reached = webSent.has(c.id);
    try {
      const vt = signCancelVoteToken(requestId, c.id);
      const link = `${base}/g/${signGuardianToken(journeyId, c.id)}?cr=${requestId}&vt=${vt}`;
      const pushTok = c.linked_user_id ? (tokenFor.get(c.linked_user_id) as string | null | undefined) : null;
      if (pushTok && (await sendPush([pushTok], "Is she safe? She's trying to cancel the alarm", "Open INNAYA to confirm she's safe or keep the alarm on.", { kind: "cancel_request", journeyId, requestId, link })) !== false) // normal channel (never vaira-alarm-2)
        reached = true;
      if (c.email && (!appOnly || (!pushTok && !webSent.has(c.id)))) {
        await sendEmail([c.email], "Is she safe? Cancel request", `<p>${escapeHtml(labels.from_label)} → ${escapeHtml(labels.to_label)}</p><p>She is asking you to confirm she is safe.</p><p><a href="${link}">Open to vote Safe / Not safe</a></p>`);
        reached = true;
      }
    } catch (e) {
      console.error("[cancel-retry] guardian send failed", journeyId, c.id, (e as Error)?.message);
    }
    if (!reached) missed.push(c.id);
  }
  if (missed.length) {
    console.error("[cancel-retry] guardians not reached", journeyId, requestId, missed);
    await logEvent({ journeyId, type: "alert_failed", payload: { fanout: "cancel_request", requestId, appOnly, missed } });
  }
  return missed;
}

async function contactsOf(db: Db, ownerId: string): Promise<CancelContact[]> {
  const { data, error } = await db.from("contacts").select("id, email, linked_user_id, tier, position").eq("owner_id", ownerId);
  if (error) throw new Error(`contacts read failed: ${error.message}`);
  return (data ?? []) as CancelContact[];
}

const won = (data: unknown) => ((data as unknown[] | null) ?? []).length > 0;

// Atomic: only the caller whose update hit the row goes on, so overlapping ticks or a
// tick racing her answer cannot open two cycles, and a row a decision has closed can
// never be claimed.
async function claimRoll(db: Db, id: string, at: string): Promise<boolean> {
  const { data } = await db.from("cancel_requests").update({ rolled_at: at }).eq("id", id).is("rolled_at", null).is("resolved_at", null).select("id");
  return won(data);
}

// The one resend, and any retry of it. resend_pending_ids holds who it has yet to reach,
// so a failure or a run cut off mid-way is not lost, and a guardian it did reach is not
// asked twice. Retrying compares the old resent_at, so racing ticks send once.
async function claimResend(db: Db, r: RequestRow, pending: string[], at: string): Promise<boolean> {
  const q = db.from("cancel_requests").update({ resent_at: at, resend_pending_ids: pending }).eq("id", r.id).is("rolled_at", null).is("resolved_at", null);
  const { data } = await (r.resent_at ? q.eq("resent_at", r.resent_at) : q.is("resent_at", null)).select("id");
  return won(data);
}

async function openCycle(db: Db, prev: RequestRow, labels: Labels, group: CancelContact[], groupIndex: number, phoneStage: PhoneStage | null = null) {
  const { data: row } = await db
    .from("cancel_requests")
    .insert({
      journey_id: prev.journey_id, owner_id: prev.owner_id, method: prev.method, media_path: prev.media_path,
      asked_contact_ids: group.map((c) => c.id), group_index: groupIndex, phone_stage: phoneStage,
      ask_pending_ids: group.map((c) => c.id), // saved first, so a run cut off mid-send is retried
    })
    .select("id")
    .single();
  const requestId = (row as { id?: string } | null)?.id;
  if (!requestId) {
    // Give the claim back: a rolled row with no next cycle would end the asking for good.
    await db.from("cancel_requests").update({ rolled_at: null }).eq("id", prev.id);
    throw new Error("cancel cycle insert failed");
  }
  await db.from("cancel_requests").update({ next_opened_at: new Date().toISOString() }).eq("id", prev.id);
  // A decision closes every open row of the journey in one update. Landed before the
  // insert: prev shows it, and the new row must carry it, because her phone reads the newest
  // row. Landed after: the new row shows it. Either way nothing goes out after a decision.
  const { data: nowRows } = await db.from("cancel_requests").select("id, verdict, resolved_at").in("id", [prev.id, requestId]);
  const decided = ((nowRows ?? []) as { id: string; verdict?: string | null; resolved_at?: string | null }[]).filter((x) => x.resolved_at);
  if (decided.length) {
    const verdict = decided.find((x) => x.id === prev.id)?.verdict ?? null;
    await db.from("cancel_requests").update({ verdict, resolved_at: new Date().toISOString() }).eq("id", requestId).is("resolved_at", null);
    await logEvent({ journeyId: prev.journey_id, type: "cancel_request_cycle_dropped", payload: { requestId, previous: prev.id, verdict } });
    return;
  }
  const missed = await askGroup(db, prev.journey_id, requestId, labels, group, false);
  await db.from("cancel_requests").update({ ask_pending_ids: missed }).eq("id", requestId);
  await logEvent({ journeyId: prev.journey_id, type: "cancel_request_cycle", payload: { requestId, previous: prev.id, groupIndex, phoneStage, askedIds: group.map((c) => c.id), missed } });
}

// Founder Q113, on the 15-min no-signal detection, while a cancel waits: the first group is
// told once, even if another group was being asked. The tick does the rest. Every later
// tick that still sees the silence lands here and stops at the stage check.
export async function cancelPhoneStopped(journeyId: string, now: number): Promise<void> {
  const db = admin();
  const { data, error } = await db
    .from("cancel_requests")
    .select("id, journey_id, owner_id, method, media_path, asked_contact_ids, created_at, group_index, phone_stage")
    .eq("journey_id", journeyId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`cancel_requests read failed: ${error.message}`);
  const cur = data as RequestRow | null;
  if (!cur || cur.phone_stage) return;
  const groups = cancelGroups(await reachableContacts(db, cur.owner_id));
  const { data: j } = await db.from("journeys").select("from_label, to_label").eq("id", journeyId).single();
  if (!(await claimRoll(db, cur.id, new Date(now).toISOString()))) return;
  await openCycle(db, cur, (j ?? {}) as Labels, groups[0] ?? [], 0, "first");
  await logEvent({ journeyId, type: "cancel_phone_stopped", payload: { previous: cur.id } });
}

async function lastSignalAt(db: Db, journeyId: string): Promise<number> {
  const { data: hb } = await db.from("heartbeats").select("ts").eq("journey_id", journeyId).order("ts", { ascending: false }).limit(1).maybeSingle();
  const { data: fr } = await db.from("events").select("ts").eq("journey_id", journeyId).eq("type", "frame").order("ts", { ascending: false }).limit(1).maybeSingle();
  const latest = (x: unknown) => { const ts = (x as { ts?: string } | null)?.ts; return ts ? new Date(ts).getTime() : 0; };
  return Math.max(latest(hb), latest(fr));
}

// Any heartbeat or frame since this stage began means the phone is working again.
async function phoneIsBack(db: Db, r: RequestRow): Promise<boolean> {
  return (await lastSignalAt(db, r.journey_id)) > new Date(r.created_at).getTime();
}

// Only rows with work: a window at 15 min or more (resend, move, an expired journey's silence
// check), a paused phone stage, a first ask still owed, a roll a run was cut off in. Dropped
// groups' rows wait for a decision and are never read, so they cannot crowd out a live alarm.
async function dueRows(db: Db, now: number): Promise<RequestRow[]> {
  const iso = (ms: number) => new Date(ms).toISOString();
  const base = () => db.from("cancel_requests").select(ROW_COLUMNS).is("resolved_at", null);
  const reads = await Promise.all([
    base().is("rolled_at", null).lte("created_at", iso(now - CANCEL_RESEND_AT_MS)).order("created_at", { ascending: true }).limit(500),
    base().is("rolled_at", null).not("phone_stage", "is", null).order("created_at", { ascending: true }).limit(500),
    base().is("rolled_at", null).neq("ask_pending_ids", "{}").order("created_at", { ascending: true }).limit(500),
    base().lte("rolled_at", iso(now - CLAIM_LEASE_MS)).is("next_opened_at", null).order("created_at", { ascending: true }).limit(500),
  ]);
  const byId = new Map<string, RequestRow>();
  for (const { data, error } of reads) {
    // E.g. the code deployed before migration 0032. Reported, never read as "nothing to do".
    if (error) throw new Error(`cancel_requests read failed: ${error.message}`);
    for (const r of (data ?? []) as unknown as RequestRow[]) byId.set(r.id, r);
  }
  return [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

// Runs on the deadman tick. Never stops until she is safe (founder Q101 2a): the only
// exits are a resolved request, a finished journey, or an alarm no longer CRITICAL. An
// expired journey goes on: expiry means her phone is silent, not that she is safe. Each
// group is notified at minute 0 and 15; at 30 the next group, wrapping (founder Q113, Q115).
export async function cancelRetryTick(now: number): Promise<{ resent: number; cycled: number }> {
  const db = admin();
  let resent = 0;
  let cycled = 0;
  const at = new Date(now).toISOString();
  const started = Date.now();
  const rows = await dueRows(db, now);
  const ids = [...new Set(rows.map((r) => r.journey_id))];
  const { data: js } = ids.length ? await db.from("journeys").select("id, status").in("id", ids) : { data: [] };
  const statusOf = new Map(((js ?? []) as { id: string; status?: string }[]).map((x) => [x.id, x.status]));
  for (const r of rows) {
    if (Date.now() - started > TICK_BUDGET_MS) {
      console.warn("[cancel-retry] tick budget used, the rest wait for the next tick");
      break;
    }
    try {
      if (r.rolled_at) {
        // A next cycle exists: the run stopped just before saying so. Nothing more to do here.
        const { data: next } = await db.from("cancel_requests").select("id").eq("journey_id", r.journey_id).gt("created_at", r.created_at).limit(1);
        if (won(next)) {
          await db.from("cancel_requests").update({ next_opened_at: at }).eq("id", r.id);
          continue;
        }
        // Rolled with no next cycle after the lease: a run was cut off between the claim
        // and the insert. Give the claim back, or the asking would end for good (Q101).
        const { data: back } = await db.from("cancel_requests").update({ rolled_at: null }).eq("id", r.id).eq("rolled_at", r.rolled_at).is("resolved_at", null).select("id");
        if (!won(back)) continue;
        console.warn("[cancel-retry] recovered a cut-off cycle", r.journey_id, r.id);
        await logEvent({ journeyId: r.journey_id, type: "cancel_request_recovered", payload: { requestId: r.id } });
      }
      const age = now - new Date(r.created_at).getTime();
      const pending = r.resend_pending_ids ?? [];
      const retryDue = !!r.resent_at && pending.length > 0 && now - new Date(r.resent_at).getTime() >= CLAIM_LEASE_MS;
      const due = age >= CANCEL_RESEND_AT_MS && (age >= CANCEL_GROUP_WINDOW_MS || !r.resent_at || retryDue);
      const askPending = r.ask_pending_ids ?? [];
      const askDue = !r.rolled_at && askPending.length > 0 && now - new Date(r.ask_retry_at ?? r.created_at).getTime() >= CLAIM_LEASE_MS;
      // The deadman only reads monitoring journeys, so an expired one's phone-stop check is here.
      const silenceCheck = !r.phone_stage && age >= PHONE_SILENT_MS && statusOf.get(r.journey_id) === "expired";
      if (!due && !r.phone_stage && !askDue && !silenceCheck) continue;
      const { data: st, error: stErr } = await db.from("journey_state").select("state").eq("journey_id", r.journey_id).order("changed_at", { ascending: false }).limit(1).maybeSingle();
      const { data: j, error: jErr } = await db.from("journeys").select("status, from_label, to_label").eq("id", r.journey_id).single();
      // A failed read says nothing about the alarm: it must not close the request.
      if (stErr || jErr) throw new Error(`state read failed: ${(stErr ?? jErr)?.message}`);
      // CANCEL_HOLD: an alarm already held when this process shipped (migration 0032).
      const state = (st as { state?: string } | null)?.state;
      if ((state !== "CRITICAL" && state !== "CANCEL_HOLD") || (j as { status?: string } | null)?.status === "done") {
        await db.from("cancel_requests").update({ resolved_at: at }).eq("journey_id", r.journey_id).is("resolved_at", null);
        continue;
      }
      const labels = j as Labels;
      // ChatGPT 3: the first ask of a cycle, any stage, retried like the resend until it lands.
      if (askDue) {
        const q = db.from("cancel_requests").update({ ask_retry_at: at }).eq("id", r.id).is("rolled_at", null).is("resolved_at", null);
        const { data: claimed } = await (r.ask_retry_at ? q.eq("ask_retry_at", r.ask_retry_at) : q.is("ask_retry_at", null)).select("id");
        if (won(claimed)) {
          const owed = (await contactsOf(db, r.owner_id)).filter((c) => askPending.includes(c.id));
          const missed = await askGroup(db, r.journey_id, r.id, labels, owed, false);
          await db.from("cancel_requests").update({ ask_pending_ids: missed }).eq("id", r.id);
          await logEvent({ journeyId: r.journey_id, type: "cancel_request_ask_retried", payload: { requestId: r.id, askedIds: askPending, missed, stage: r.phone_stage ?? null } });
        }
      }
      if (silenceCheck && now - (await lastSignalAt(db, r.journey_id)) >= PHONE_SILENT_MS) {
        await cancelPhoneStopped(r.journey_id, now);
        cycled++;
        continue;
      }
      if (!due && !r.phone_stage) continue;
      let moveNow = false;
      const stage = r.phone_stage;
      if (stage) {
        if (await phoneIsBack(db, r)) {
          // The normal process resumes. All guardians have just been asked, so that row
          // moves on at once; a first-group row runs out its own clock.
          await db.from("cancel_requests").update({ phone_stage: null }).eq("id", r.id);
          await logEvent({ journeyId: r.journey_id, type: "cancel_phone_back", payload: { requestId: r.id, stage } });
          moveNow = stage === "all";
        } else {
          // Paused: only first group -> all guardians, once, after 15 min with no answer.
          if (stage === "first" && age >= CANCEL_RESEND_AT_MS) {
            const all = cancelGroups(await reachableContacts(db, r.owner_id)).flat();
            if (await claimRoll(db, r.id, at)) {
              await openCycle(db, r, labels, all, 0, "all");
              cycled++;
            }
          }
          continue;
        }
        if (!due && !moveNow) continue;
      }
      if (age >= CANCEL_GROUP_WINDOW_MS || moveNow) {
        // Read before the claim: a failed read leaves the row unclaimed for the next tick.
        const groups = cancelGroups(await reachableContacts(db, r.owner_id));
        if (!(await claimRoll(db, r.id, at))) continue;
        if (pending.length) {
          console.error("[cancel-retry] resend never reached", r.journey_id, r.id, pending);
          await logEvent({ journeyId: r.journey_id, type: "cancel_request_resend_missed", payload: { requestId: r.id, missed: pending } });
        }
        if (!groups.length) { await logEvent({ journeyId: r.journey_id, type: "cancel_request_no_guardian", payload: { requestId: r.id } }); }
        const idx = groups.length ? ((r.group_index ?? 0) + 1) % groups.length : 0;
        await openCycle(db, r, labels, groups[idx] ?? [], idx);
        cycled++;
      } else {
        const contacts = await contactsOf(db, r.owner_id);
        const toSend = r.resent_at ? pending : r.asked_contact_ids;
        if (!(await claimResend(db, r, toSend, at))) continue;
        const group = contacts.filter((c) => toSend.includes(c.id));
        const missed = await askGroup(db, r.journey_id, r.id, labels, group, true);
        await db.from("cancel_requests").update({ resend_pending_ids: missed }).eq("id", r.id);
        await logEvent({ journeyId: r.journey_id, type: "cancel_request_resent", payload: { requestId: r.id, askedIds: toSend, missed, retry: !!r.resent_at } });
        resent++;
      }
    } catch (e) {
      console.error("[cancel-retry] tick failed", r.journey_id, r.id, (e as Error)?.message);
    }
  }
  return { resent, cycled };
}
