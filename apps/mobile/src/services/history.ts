import { supabase } from "../lib/supabase";

// Task 34 — journey history + admin timeline reads.
// `journeys_v` is the owner-scoped journeys view; `events` is the append-only
// audit log. `user_feedback` on a state_change row is the 👍/👎 the owner leaves
// on an alert (genuine | false_alarm | null).

export type Feedback = "genuine" | "false_alarm";

// Share of resolved alerts the owner marked as false alarms. Rows with no
// feedback are ignored; an empty (or all-null) set is 0, never a divide-by-zero.
export function falseAlarmRate(rows: { user_feedback: string | null }[]): number {
  const g = rows.filter((r) => r.user_feedback === "genuine").length;
  const f = rows.filter((r) => r.user_feedback === "false_alarm").length;
  return g + f ? f / (g + f) : 0;
}

export const history = {
  journeys: async (userId: string) =>
    (
      await supabase
        .from("journeys_v")
        .select("id, from_label, to_label, start_at, status")
        .eq("owner_id", userId)
        .order("start_at", { ascending: false })
    ).data ?? [],

  alerts: async (journeyId: string) =>
    (
      await supabase
        .from("events")
        .select("id, ts, type, payload, danger_score, user_feedback")
        .eq("journey_id", journeyId)
        .eq("type", "state_change")
        .order("seq")
    ).data ?? [],

  feedback: (eventId: number, v: Feedback) =>
    supabase.from("events").update({ user_feedback: v }).eq("id", eventId),

  timeline: async (journeyId: string) =>
    (
      await supabase
        .from("events")
        .select("seq, ts, type, payload, danger_score, model_reasons, latency_ms, user_feedback")
        .eq("journey_id", journeyId)
        .order("seq")
    ).data ?? [],
};
