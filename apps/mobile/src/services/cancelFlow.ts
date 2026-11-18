// ADR-043 — the EMERGENCY "I'm safe now" guardian-confirm realtime channel.
//
// The ADR-014 CRITICAL cancel machinery (two-password gate, the 5 s/15 s holds,
// the guardian-call starter) is retired — the guardian-approved cancel now runs
// through CancelFlow + /api/cancel-request + the cancel_votes realtime (see
// cancelFlowDeps.ts). What REMAINS here is the pre-043, still-live path: a score
// escalation to EMERGENCY where a guardian confirms the wearer is safe. The
// runner only ADOPTS a server state that ranks HIGHER than the local one, so a
// de-escalation never reaches the phone by itself; when a `cancel_calls` row's
// result arrives we `runner.send()` the de-escalating event locally.
import type { ProtocolEvent } from "@vaira/core";
import { supabase } from "../lib/supabase";
import { useJourney } from "../store/journey";

export type CancelResult = "safe" | "wrong" | "failed";

// Lazy so the runner ↔ cancelFlow require cycle never bites at load time.
function send(e: ProtocolEvent) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require("./protocolRunner").runner as { send: (ev: ProtocolEvent) => void }).send(e);
}

let channel: unknown = null;
let subscribedTo: string | null = null;
const handled = new Set<string>();

// A guardian verdict on the EMERGENCY "I'm safe now" confirm. Safe → the are-you
// -safe challenge passes (guardian-confirmed); "wrong" re-raises to CRITICAL; a
// failed/unreachable result keeps monitoring. Idempotent per row id.
function onResult(result: CancelResult | null | undefined, rowId?: string) {
  if (!result) return;
  if (rowId) {
    if (handled.has(rowId)) return;
    handled.add(rowId);
  }
  if (useJourney.getState().ctx.state !== "EMERGENCY") return; // only the EMERGENCY confirm
  send(result === "safe" ? { type: "CHALLENGE_PASSED", guardianConfirmed: true } : result === "wrong" ? { type: "SOS" } : { type: "CALL_FAILED" });
}

function subscribe(journeyId: string) {
  if (subscribedTo === journeyId && channel) return;
  if (channel) {
    try {
      supabase.removeChannel?.(channel as never);
    } catch {
      /* ignore */
    }
    channel = null;
  }
  subscribedTo = journeyId;
  const filter = `journey_id=eq.${journeyId}`;
  const ch = supabase.channel?.(`cc:${journeyId}`) as
    | { on: (e: string, cfg: unknown, h: (p: { new?: { result?: CancelResult; id?: string } }) => void) => unknown; subscribe: () => void }
    | undefined;
  if (!ch) {
    channel = null;
    return;
  }
  // UPDATE = the usual path (a null-result row filled in). INSERT with a non-null
  // result covers the EMERGENCY path, which inserts and resolves in a single row.
  const handler = (p: { new?: { result?: CancelResult; id?: string } }) => onResult(p?.new?.result, p?.new?.id);
  const chained = ch.on("postgres_changes", { event: "UPDATE", schema: "public", table: "cancel_calls", filter }, handler) as typeof ch;
  (chained ?? ch).on("postgres_changes", { event: "INSERT", schema: "public", table: "cancel_calls", filter }, handler);
  ch.subscribe();
  channel = ch;
}

export const cancelFlow = {
  ensureSubscribed(journeyId: string) {
    subscribe(journeyId);
  },
  dispose() {
    if (channel) {
      try {
        supabase.removeChannel?.(channel as never);
      } catch {
        /* ignore */
      }
    }
    channel = null;
    subscribedTo = null;
    handled.clear();
  },
  // exposed for the realtime handler + tests.
  onResult,
};

// Subscribe lazily as soon as the phone is in a state that can receive a guardian
// EMERGENCY confirm, and tear down when the journey ends. Registered once at load.
useJourney.subscribe((s) => {
  const st = s.ctx.state;
  const jid = s.journey?.id as string | undefined;
  if ((st === "EMERGENCY" || st === "CRITICAL" || st === "CANCEL_HOLD") && jid) cancelFlow.ensureSubscribed(jid);
  else if (st === "IDLE" || st === "RESOLVED") cancelFlow.dispose();
});
