import { admin } from "./supabaseAdmin";

export async function logEvent(e: {
  journeyId: string | null;
  type: string;
  payload?: unknown;
  dangerScore?: number;
  modelReasons?: string[];
  latencyMs?: number;
  frameUrl?: string;
}): Promise<void> {
  let seq = 0;
  if (e.journeyId) {
    const { data } = await admin().rpc("next_event_seq", { p_journey_id: e.journeyId });
    seq = Number(data ?? 0);
  }
  const { error } = await admin().from("events").insert({
    journey_id: e.journeyId,
    seq,
    type: e.type,
    payload: e.payload ?? {},
    danger_score: e.dangerScore ?? null,
    model_reasons: e.modelReasons ?? null,
    latency_ms: e.latencyMs ?? null,
    frame_url: e.frameUrl ?? null,
  });
  // J2: this line is the model_call insert failure signal an operator greps for —
  // model_call had never appeared across b8–b13, so a silent DB error here must be
  // loud. logEvent stays void; the analyze route logs the attempt separately.
  if (error) console.error("[events] insert failed", e.type, error.message);
}
