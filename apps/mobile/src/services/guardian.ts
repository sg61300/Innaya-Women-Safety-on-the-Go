import { supabase } from "../lib/supabase";
import { get, post } from "../lib/api";
import { events } from "../lib/events";

// Guardian-side patch-in countdown: a plain timer that auto-declines after `ms`
// unless the returned canceller runs first. onYes is the caller's own handler
// for the Yes button; the timer only fires onNo (auto-decline), matching the
// UX where doing nothing means "don't patch me into the call". Returns a
// disposer so the screen can cancel on unmount or on a Yes tap.
export function patchCountdown(onYes: () => void, onNo: () => void, ms = 5000): () => void {
  void onYes;
  const t = setTimeout(onNo, ms);
  return () => clearTimeout(t);
}

export type TrusteeJourney = { id: string; state: string; from: string; to: string; startAt: string };
export type Trustee = { contactId: string; ownerId: string; name: string; tier: string; journey?: TrusteeJourney };
export type MonitorSnapshot = {
  journey: { from: string | null; to: string | null; name: string | null; phone: string | null };
  state: string;
  location: { lat: number; lng: number; ts: string } | null;
  heartbeat: { battery: number | null; ts: string } | null;
  frame: { url: string; ts: string } | null;
};

export const guardian = {
  snapshot: (journeyId: string) => get<MonitorSnapshot>(`/api/monitoring?journeyId=${encodeURIComponent(journeyId)}`),
  // People this user is a guardian for, each with their most recent live/planned
  // journey and its latest protocol state (IDLE when none is running).
  async trustees(userId: string): Promise<Trustee[]> {
    const { data } = await supabase
      .from("contacts")
      .select("id, owner_id, tier, profiles!contacts_owner_id_fkey(name)")
      .eq("linked_user_id", userId);
    const out: Trustee[] = [];
    for (const c of (data ?? []) as any[]) {
      const { data: j } = await supabase
        .from("journeys_v")
        .select("id, from_label, to_label, start_at")
        .eq("owner_id", c.owner_id)
        .in("status", ["planned", "monitoring"])
        .order("start_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: s } = j
        ? await supabase
            .from("journey_state")
            .select("state")
            .eq("journey_id", (j as any).id)
            .order("changed_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null };
      out.push({
        contactId: c.id,
        ownerId: c.owner_id,
        name: c.profiles?.name ?? "Trustee",
        tier: c.tier,
        journey: j
          ? { id: (j as any).id, state: (s as any)?.state ?? "IDLE", from: (j as any).from_label, to: (j as any).to_label, startAt: (j as any).start_at }
          : undefined,
      });
    }
    return out;
  },
  respond: (journeyId: string, response: "accept" | "decline") =>
    post("/api/monitoring", { action: "respond", journeyId, response }),
  heartbeat: (journeyId: string) => post("/api/monitoring", { action: "heartbeat", journeyId }),
  checkOnHer: (journeyId: string) =>
    post("/api/journey-state", { journeyId, event: { type: "GUARDIAN_CONCERN" } }),
  async confirmSafe(journeyId: string) {
    await events.log("guardian_cancel_result", { result: "safe" }, journeyId);
    await events.flush();
    return post("/api/cancel-confirm", { journeyId, result: "safe" });
  },
  // ADR-014: a "Something's wrong" verdict rides the same cancel_calls channel as
  // "She's safe", so the server writes the row and the traveller's phone learns the
  // result over realtime (EMERGENCY → SOS).
  async somethingWrong(journeyId: string) {
    await events.log("guardian_cancel_result", { result: "wrong" }, journeyId);
    await events.flush();
    return post("/api/cancel-confirm", { journeyId, result: "wrong" });
  },
  async lateConfirm(journeyId: string, safe: boolean) {
    await events.log("guardian_late_confirm", { safe }, journeyId);
    await events.flush();
    return post("/api/journey-state", { journeyId, event: { type: "GUARDIAN_LATE_CONFIRM", safe } });
  },
  raiseSos: (journeyId: string) => post("/api/journey-state", { journeyId, event: { type: "SOS" } }),
};
