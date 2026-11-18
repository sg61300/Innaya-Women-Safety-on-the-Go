import { requireUser } from "@/lib/auth";
import { admin } from "@/lib/supabaseAdmin";
import { applyEvent } from "@/lib/journeyState";
import { logEvent } from "@/lib/events";
import type { ProtocolEvent } from "@vaira/core";

// Task 29b (ADR-014 gate 3): the guardian's verdict on the cancel. Guardian only
// (the owner gets 403, she cannot self-confirm). Writes the cancel_calls row (which
// reaches her phone over realtime) and applies the matching protocol event on the
// server, so both sides converge.
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const { journeyId, result } = await req.json();
    if (!journeyId || (result !== "safe" && result !== "wrong")) return new Response("bad request", { status: 400 });

    const db = admin();
    const { data: j } = await db.from("journeys").select("owner_id").eq("id", journeyId).single();
    if (!j) return new Response("not found", { status: 404 });
    if (j.owner_id === user.id) return new Response("forbidden", { status: 403 });

    // Authorise: an active (assigned) guardian, OR someone linked to one of the
    // owner's contacts (the EMERGENCY "I'm safe" path has no active assignment).
    const { data: g } = await db.rpc("is_active_guardian_for", { p_journey_id: journeyId, p_user_id: user.id });
    const { data: contact } = await db
      .from("contacts")
      .select("id")
      .eq("owner_id", j.owner_id)
      .eq("linked_user_id", user.id)
      .maybeSingle();
    const contactId = (contact as { id?: string } | null)?.id ?? null;
    if (!g && !contactId) return new Response("forbidden", { status: 403 });

    const resultedAt = new Date().toISOString();
    const { data: open } = await db
      .from("cancel_calls")
      .select("id")
      .eq("journey_id", journeyId)
      .is("result", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if ((open as { id?: string } | null)?.id) {
      await db.from("cancel_calls").update({ result, resulted_at: resultedAt }).eq("id", (open as { id: string }).id);
    } else {
      await db.from("cancel_calls").insert({ journey_id: journeyId, contact_id: contactId, result, resulted_at: resultedAt });
    }

    const { data: last } = await db
      .from("journey_state")
      .select("state")
      .eq("journey_id", journeyId)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const state = ((last as { state?: string } | null)?.state as string) ?? "IDLE";

    // ADR-043: the guardian-approved cancel (old AMBER_HOLD gate 3) now runs through
    // /api/cancel-request/[id]/vote. This route keeps only the EMERGENCY "I'm safe"
    // guardian-confirm path (score-2 AreYouSafe challenge), which ADR-043 leaves as is.
    let ev: ProtocolEvent | null = null;
    if (state === "EMERGENCY") ev = result === "safe" ? { type: "CHALLENGE_PASSED", guardianConfirmed: true } : { type: "SOS" };

    let newState = state;
    if (ev) {
      const r = await applyEvent(journeyId, ev, "trustee");
      newState = r.state;
    }

    await logEvent({ journeyId, type: "guardian_cancel_result", payload: { result, by: user.id } });
    return Response.json({ state: newState });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[cancel-confirm]", e);
    return new Response("error", { status: 500 });
  }
}
