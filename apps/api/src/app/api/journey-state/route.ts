import { requireUser } from "@/lib/auth";
import { admin } from "@/lib/supabaseAdmin";
import { applyEvent } from "@/lib/journeyState";
import { liveAllowed } from "@/lib/liveGate";

// A guardian (active trustee) may only send these events; the owner may send any.
// ADR-043: the cancel-flow events (CANCEL_STEP1_OK/CANCEL_STEP2_OK/CANCEL_REQUESTED)
// are owner-only — they are absent here, so a guardian sending one gets 403. A
// guardian's vote never comes through this route; it uses the signed /g/ link's
// /api/cancel-request/[id]/vote (no JWT).
const GUARDIAN_EVENTS = new Set(["GUARDIAN_CONCERN", "GUARDIAN_SAYS_WRONG", "GUARDIAN_LATE_CONFIRM", "SOS"]);

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const { journeyId, event } = await req.json();
    if (!journeyId || !event?.type) return new Response("bad request", { status: 400 });
    const db = admin();
    const { data: j } = await db.from("journeys").select("owner_id").eq("id", journeyId).single();
    if (!j) return new Response("not found", { status: 404 });
    let actor = "user";
    if (j.owner_id !== user.id) {
      const { data: g } = await db.rpc("is_active_guardian_for", { p_journey_id: journeyId, p_user_id: user.id });
      if (!g || !GUARDIAN_EVENTS.has(event.type)) return new Response("forbidden", { status: 403 });
      actor = "trustee";
    }
    const r = await applyEvent(journeyId, event, actor);
    return Response.json({ ...r, liveAllowed: liveAllowed(r.state) });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[journey-state]", e);
    return new Response("error", { status: 500 });
  }
}
