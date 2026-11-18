import { requireUser } from "@/lib/auth";
import { admin } from "@/lib/supabaseAdmin";
import { applyEvent } from "@/lib/journeyState";
import { liveAllowed } from "@/lib/liveGate";
import { liveDistress } from "@/lib/guardianEnd";

// A guardian (active trustee) may only send these events; the owner may send any.
// ADR-043: the cancel-flow events (CANCEL_STEP1_OK/CANCEL_STEP2_OK/CANCEL_REQUESTED)
// are owner-only — they are absent here, so a guardian sending one gets 403. A
// guardian's vote never comes through this route; it uses the signed /g/ link's
// /api/cancel-request/[id]/vote (no JWT).
const GUARDIAN_EVENTS = new Set(["GUARDIAN_CONCERN", "GUARDIAN_SAYS_WRONG", "GUARDIAN_LATE_CONFIRM", "SOS"]);

// Fix lane F3 (founder 2026-11-12): her own account can never end her own emergency-word alarm,
// and (the disclosed side effect she accepted) can no longer end ANY alarm still waiting on a
// guardian. True while the emergency-word alarm is live (liveDistress, the one shared definition),
// while a normal cancel question is still open on a CRITICAL alarm, or in the legacy CANCEL_HOLD
// wait. When none hold, the alarm is no longer waiting, so her phone's echo (a GUARDIAN_VOTE
// safe:true sent after it saw a guardian cancel) changes nothing and is taken (the state stays put).
async function ownerEndWaiting(db: ReturnType<typeof admin>, journeyId: string): Promise<boolean> {
  if ((await liveDistress(db, journeyId)).ok) return true;
  const { data: st } = await db.from("journey_state").select("state").eq("journey_id", journeyId).order("changed_at", { ascending: false }).limit(1).maybeSingle();
  const state = (st?.state as string) ?? "IDLE";
  if (state === "CANCEL_HOLD") return true;
  if (state !== "CRITICAL") return false;
  const { data: open } = await db.from("cancel_requests").select("id").eq("journey_id", journeyId).is("resolved_at", null).limit(1).maybeSingle();
  return Boolean((open as { id?: string } | null)?.id);
}

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
    // Fix lane F3: the owner's Safe is refused while any alarm is waiting on a guardian; a guardian's
    // own vote never reaches here (GUARDIAN_VOTE is absent from GUARDIAN_EVENTS, so a trustee got 403).
    if (j.owner_id === user.id && event.type === "GUARDIAN_VOTE" && event.safe === true && (await ownerEndWaiting(db, journeyId)))
      return new Response("her own account cannot end this alarm", { status: 403 });
    const r = await applyEvent(journeyId, event, actor);
    return Response.json({ ...r, liveAllowed: liveAllowed(r.state) });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[journey-state]", e);
    return new Response("error", { status: 500 });
  }
}
