// Fix AD round 2 (founder Q78, Q93, Q95, Q101). While a guardian cancel is waiting her
// screen is normal, so nothing on screen can own the wait. This service does:
//  - offline: keeps retrying the request until the network is back, then the same process;
//  - online: watches the journey's newest cancel_requests row (realtime + a poll in case
//    the socket drops, reading the row directly under the owner RLS policy) for a guardian
//    verdict and for a cycle with nobody to ask; after the emergency word, for a guardian's end;
//  - after a Safe, while heightened monitoring runs: an overturn (2 Not safe) on the same
//    cadence, because her phone otherwise learns of it only when it next posts.
// The clock itself runs on the server (cancelRetry.ts); a dead phone does not stop it.
import type { ProtocolEvent } from "@vaira/core";
import { post } from "../lib/api";
import { supabase } from "../lib/supabase";
import { useJourney } from "../store/journey";
import { cancelOfflineMarker } from "./cancelOfflineMarker";
import { eventOutbox } from "./eventOutbox";

export const CANCEL_WATCH_POLL_MS = 15_000;

// Lazy so the runner <-> deps require cycle never bites at load time.
const runner = () => require("./protocolRunner").runner as { send: (e: ProtocolEvent) => Promise<void>; isPractice: () => boolean; adoptOverturn: () => Promise<void>; reconcile?: () => Promise<void> };

let watching: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let channel: unknown = null;
let finished = false;
let overturned = false;

type Row = { verdict?: string | null; asked_contact_ids?: string[] | null; resolved_at?: string | null };

function applyRow(row: Row | null) {
  if (!row) return;
  const { ctx } = useJourney.getState();
  if (ctx.state === "RESOLVED_MONITORING") {
    if (row.verdict === "reraise" && !overturned) {
      overturned = true;
      void runner().adoptOverturn();
    }
    return;
  }
  if (finished) return;
  // Fix lane D5 (founder Q125): after the emergency word only a guardian who spoke to her ends
  // it. Her phone takes the same path as an approved Safe; anything else changes nothing here.
  if (ctx.quietAlarm) {
    if (row.verdict !== "cancel") return;
    finished = true;
    useJourney.getState().set({ cancelApproved: true, ctx: { ...ctx, cancelWaiting: true } });
    void cancelOfflineMarker.clear(); // a restart must not bring the quiet alarm back
    void runner().send({ type: "GUARDIAN_VOTE", safe: true, contactId: "" });
    return;
  }
  if (row.verdict === "cancel") {
    finished = true;
    useJourney.getState().set({ cancelApproved: true }); // founder Q120, Q121
    void runner().send({ type: "GUARDIAN_VOTE", safe: true, contactId: "" });
  } else if (row.resolved_at && (!row.verdict || row.verdict === "pending")) {
    // Closed with no verdict (journey finished, or an old row closed by the migration): nobody
    // will answer, so she is not left waiting. Same rule as a refused cancel: the alarm comes
    // back, silent stays silent, and the check that follows sees a journey already over.
    finished = true;
    void runner().send({ type: "GUARDIAN_SAYS_WRONG" }).then(() => runner().reconcile?.());
  } else if (row.verdict === "keep" || row.verdict === "reraise") {
    finished = true;
    void runner().send({ type: "GUARDIAN_SAYS_WRONG" });
  } else {
    const nobody = Array.isArray(row.asked_contact_ids) && row.asked_contact_ids.length === 0;
    if (useJourney.getState().cancelNoGuardian !== nobody) useJourney.getState().set({ cancelNoGuardian: nobody });
  }
}

export async function cancelWatchTick(journeyId: string) {
  const s = useJourney.getState();
  try {
    if (s.cancelOffline) {
      await eventOutbox.ensureCancel(journeyId, s.ctx.alarmMode);
      await eventOutbox.deliver();
      return;
    }
    const { data } = await supabase
      .from("cancel_requests")
      .select("verdict, asked_contact_ids, resolved_at")
      .eq("journey_id", journeyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    applyRow(data as Row | null);
  } catch (e) {
    console.warn("[cancelWatch] tick failed", String((e as Error)?.message ?? e)); // the next tick retries
  }
}

function start(journeyId: string) {
  watching = journeyId;
  finished = false;
  overturned = false;
  timer = setInterval(() => void cancelWatchTick(journeyId), CANCEL_WATCH_POLL_MS);
  const ch = supabase.channel?.(`cw:${journeyId}`)?.on?.(
    "postgres_changes",
    { event: "*", schema: "public", table: "cancel_requests", filter: `journey_id=eq.${journeyId}` },
    () => void cancelWatchTick(journeyId),
  );
  ch?.subscribe?.();
  channel = ch ?? null;
  void cancelWatchTick(journeyId);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  try { if (channel) supabase.removeChannel?.(channel as never); } catch { /* ignore */ }
  channel = null;
  watching = null;
  const s = useJourney.getState();
  if (!s.ctx.quietAlarm) void cancelOfflineMarker.clear(); // quiet: a restart must stay quiet
  if (s.cancelOffline || s.cancelNoGuardian) s.set({ cancelOffline: false, cancelNoGuardian: false });
}

// Registered once at load. A practice drill never opens a request and never watches one.
// A quiet alarm (emergency word) is watched too, for a guardian's end (fix lane D5).
useJourney.subscribe((s) => {
  const id = s.ctx.cancelWaiting || s.ctx.quietAlarm || s.ctx.state === "RESOLVED_MONITORING" ? (s.journey?.id as string | undefined) : undefined;
  if (watching && watching !== id) stop();
  if (id && !watching && !runner().isPractice()) start(id);
});
