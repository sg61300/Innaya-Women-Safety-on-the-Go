import { admin } from "@/lib/supabaseAdmin";
import { applyEvent } from "@/lib/journeyState";
import { logEvent } from "@/lib/events";
import { requireUser } from "@/lib/auth";
import { verifyGuardianTokenAnyAge } from "@/lib/token";
import { guardianEndCheck, tellOtherGuardians } from "@/lib/guardianEnd";

// Fix lane D5 (founder Q125): a guardian who has spoken to her ends an emergency-word alarm.
// Separate from Safe / Not safe, which stay refused on that alarm. Authorised by the
// guardian's own signed page link (?t=), which names them; its 24 h life is not checked here,
// because the action is refused anyway unless her newest request is 'distress' and the alarm
// is live, and an alarm must not outlive every link that could end it (brief item 7).
// Fix lane D7 item 9: or by the guardian app's signed-in account (?journeyId=), which names
// them through her contact row linked to that account. Same check, same rules (D7 rotation).
// The confirm field is the second step: the first step only opens the question.
const page = (status: number, msg: string) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>INNAYA</title><body style="font:16px system-ui;padding:2rem"><p>${msg}</p></body>`, { status, headers: { "content-type": "text/html; charset=utf-8" } });

type Who = { journeyId: string; contactId: string; expired: boolean; via: "link" | "app" } | null;
async function who(req: Request): Promise<Who> {
  const url = new URL(req.url);
  const t = url.searchParams.get("t");
  if (t !== null) {
    const tok = verifyGuardianTokenAnyAge(t);
    return tok?.contactId ? { journeyId: tok.journeyId, contactId: tok.contactId, expired: tok.expired, via: "link" } : null;
  }
  const user = await requireUser(req); // throws a 401 Response
  const journeyId = url.searchParams.get("journeyId");
  if (!journeyId) return null;
  const db = admin();
  const { data: j } = await db.from("journeys").select("owner_id").eq("id", journeyId).maybeSingle();
  // Owner Q116, Q125: she cannot end her own emergency-word alarm, even linked as her own contact.
  if (!j || (j as { owner_id: string }).owner_id === user.id) return null;
  const { data: c } = await db.from("contacts").select("id").eq("owner_id", (j as { owner_id: string }).owner_id).eq("linked_user_id", user.id).limit(1).maybeSingle();
  return c ? { journeyId, contactId: (c as { id: string }).id, expired: false, via: "app" } : null;
}

// The guardian app asks whether to show the action: open, closed (greyed), or none.
export async function GET(req: Request) {
  try {
    const w = await who(req);
    if (!w) return Response.json({ end: "none" });
    const check = await guardianEndCheck(admin(), w.journeyId, w.contactId);
    return Response.json({ end: check.ok ? "open" : check.reason === "window_closed" ? "closed" : "none" });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[guardian-end] status", e);
    return new Response("error", { status: 500 });
  }
}

const CLOSED_MSG = "You can't end the alarm right now. Another group of her guardians has been asked. Nothing was changed.";

async function confirmed(req: Request): Promise<boolean> {
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const b = await req.json().catch(() => null);
    return b?.confirm === "yes";
  }
  const f = await req.formData().catch(() => null);
  return f?.get("confirm") === "yes";
}

export async function POST(req: Request) {
  const html = (req.headers.get("accept") ?? "").includes("text/html");
  const reply = (status: number, result: string, msg: string, state: string | null = null, reason?: string) => (html ? page(status, msg) : Response.json({ result, state, ...(reason ? { reason } : {}) }, { status }));
  try {
    const w = await who(req);
    if (!w) return reply(403, "forbidden", "This link cannot end the alarm.");
    const { journeyId, contactId } = w;
    if (!(await confirmed(req))) return reply(400, "not_confirmed", "Nothing was changed.");

    const db = admin();
    const check = await guardianEndCheck(db, journeyId, contactId);
    if (!check.ok) {
      await logEvent({ journeyId, type: "guardian_end_refused", payload: { contactId, reason: check.reason, verdict: check.verdict ?? null, linkExpired: w.expired, via: w.via } });
      if (check.reason === "not_her_guardian" || check.reason === "no_journey") return reply(403, "forbidden", "This link cannot end the alarm.");
      if (check.reason === "window_closed") return reply(410, "refused", CLOSED_MSG, null, "window_closed");
      return reply(410, "refused", check.verdict === "cancel" ? "The alarm has already ended. Nothing was changed." : "This alarm cannot be ended here. Nothing was changed.", null, check.reason);
    }
    // Fix lane F1 (founder 2026-11-12): turning 'distress' into the end AND moving the alarm to
    // heightened RESOLVED_MONITORING happen in ONE database step (0036). Of two guardians at once
    // only one claims the distress row; the other gets claimed=false. If her state moved first
    // (her own SOS, say), the core keeps the state and nothing is claimed. No give-back is needed:
    // on a lost claim or a failed step nothing was written.
    const applied = await applyEvent(journeyId, { type: "GUARDIAN_VOTE", safe: true, contactId }, "trustee", undefined, { cancelWaiting: true, atomicClaim: { requestId: check.requestId, claimMode: "distress", closeSiblings: false } });
    if (applied.outcome !== "applied") {
      const reason = applied.outcome === "claim_lost" ? "claimed_by_another" : "state_moved";
      await logEvent({ journeyId, type: "guardian_end_refused", payload: { contactId, reason, requestId: check.requestId, state: applied.state, via: w.via } });
      const msg = applied.outcome === "claim_lost"
        ? "The alarm has already ended. Nothing was changed."
        : "This alarm cannot be ended here. Nothing was changed.";
      return reply(410, "refused", msg, null, reason);
    }
    await db.from("alerts").insert({ journey_id: journeyId, recipient: contactId, channel: "admin", state: applied.state });
    await logEvent({ journeyId, type: "guardian_ended_alarm", payload: { requestId: check.requestId, guardianContactId: contactId, at: new Date().toISOString(), linkExpired: w.expired, via: w.via } });
    await tellOtherGuardians(db, journeyId, check.ownerId, contactId);
    return reply(200, "ended", "Thank you. The alarm has ended. Her journey is still being watched.", applied.state);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[guardian-end]", e);
    return new Response("error", { status: 500 });
  }
}
