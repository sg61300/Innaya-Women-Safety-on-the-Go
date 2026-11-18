import { admin } from "@/lib/supabaseAdmin";
import { applyEvent } from "@/lib/journeyState";
import { logEvent } from "@/lib/events";
import { sendEmail, escapeHtml } from "@/lib/alerts";
import { verifyCancelVoteToken } from "@/lib/token";
import { cancelVerdict, type AlarmMode, type ProtocolEvent } from "@vaira/core";

// ADR-043 step 7: a guardian votes Safe / Not safe on an open cancel request. No
// session — the per-guardian signed vote token (from the /g/ cancel link) carries
// the (requestId, contactId) pair. The route records the vote (unique per
// request+contact, so a double vote is idempotent), recomputes the majority
// verdict over ALL votes, and applies it through the pure protocol:
//   cancel  → first Safe, heightened RESOLVED_MONITORING
//   keep    → 2+ Not safe, alarm stays on (CRITICAL)
//   reraise → a Safe already cancelled, then 2 Not safe → CRITICAL, mode kept
//   pending → not decisive yet, request stays open
async function readBody(req: Request): Promise<{ safe: boolean | null; form: boolean }> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const b = await req.json().catch(() => ({}));
    return { safe: typeof b.safe === "boolean" ? b.safe : null, form: false };
  }
  const f = await req.formData().catch(() => null);
  const v = f?.get("safe");
  return { safe: v === "true" ? true : v === "false" ? false : null, form: true };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const tok = verifyCancelVoteToken(url.searchParams.get("t") ?? "");
    if (!tok || tok.requestId !== id) return new Response("forbidden", { status: 403 });

    const { safe } = await readBody(req);
    if (safe === null) return new Response("bad request", { status: 400 });

    const db = admin();
    const { data: r } = await db
      .from("cancel_requests")
      .select("id, journey_id, owner_id, asked_contact_ids, method, verdict, resolved_at")
      .eq("id", id)
      .single();
    if (!r) return new Response("not found", { status: 404 });
    if (!(r.asked_contact_ids as string[]).includes(tok.contactId)) return new Response("forbidden", { status: 403 });

    // Idempotent write: unique(request_id, contact_id) means a re-vote is ignored,
    // so the first recorded answer stands.
    await db
      .from("cancel_votes")
      .upsert({ request_id: id, contact_id: tok.contactId, safe }, { onConflict: "request_id,contact_id", ignoreDuplicates: true });

    const { data: voteRows } = await db
      .from("cancel_votes")
      .select("safe, created_at")
      .eq("request_id", id)
      .order("created_at", { ascending: true });
    const votes = (voteRows ?? []).map((v: any) => ({ safe: v.safe as boolean }));
    const verdict = cancelVerdict(votes, (r.asked_contact_ids as string[]).length);

    // A no-JS guardian form posts urlencoded and expects HTML back; an API caller
    // gets JSON. One responder used by both the idempotent short-circuit and the
    // normal exit so they stay in sync.
    const respond = (state: string | null) => {
      const accept = req.headers.get("accept") ?? "";
      if (accept.includes("text/html")) {
        const msg = verdict === "cancel" ? "Thank you — the alarm has been cancelled."
          : verdict === "reraise" ? "Thank you — the alarm has been turned back on."
          : verdict === "keep" ? "Thank you — the alarm stays on."
          : "Thank you — your answer was recorded.";
        return new Response(`<!doctype html><meta charset="utf-8"><title>Recorded</title><body style="font:16px system-ui;padding:2rem"><p>${msg}</p></body>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
      }
      return Response.json({ verdict, state });
    };

    // A4: two guardians voting within the same second both read the vote list and
    // both recompute the verdict. If this request is already resolved with the
    // same non-pending verdict, the protocol event was already applied — short out
    // so applyEvent (and the re-notify/audit below) does not run a second time.
    // Concurrent votes that race before the first resolve are accepted for the MVP
    // (reported as open); the unique(request_id, contact_id) constraint bounds it.
    if (r.resolved_at && typeof r.verdict === "string" && r.verdict !== "pending" && r.verdict === verdict) {
      const { data: cur } = await db
        .from("journey_state")
        .select("state")
        .eq("journey_id", r.journey_id)
        .order("changed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return respond((cur?.state as string) ?? null);
    }

    const { data: j } = await db.from("journeys").select("alarm_mode").eq("id", r.journey_id).single();
    const alarmMode = ((j?.alarm_mode as AlarmMode) ?? "siren");

    const ev: ProtocolEvent =
      verdict === "cancel" ? { type: "GUARDIAN_VOTE", safe: true, contactId: tok.contactId }
      : verdict === "keep" ? { type: "GUARDIAN_SAYS_WRONG" }
      : verdict === "reraise" ? { type: "SOS", mode: alarmMode }
      : { type: "GUARDIAN_VOTE", safe: false, contactId: tok.contactId }; // pending: log the vote, no state change
    const applied = await applyEvent(r.journey_id, ev, "trustee");

    const resolved = verdict !== "pending";
    await db.from("cancel_requests").update({ verdict, resolved_at: resolved ? new Date().toISOString() : null }).eq("id", id);
    await db.from("alerts").insert({ journey_id: r.journey_id, recipient: tok.contactId, channel: "admin", state: applied.state });

    if (verdict === "cancel") {
      const { data: c } = await db.from("contacts").select("name").eq("id", tok.contactId).single();
      const name = (c?.name as string | undefined)?.trim() || "a guardian";
      await logEvent({ journeyId: r.journey_id, type: "cancel_guardian_approved", payload: { requestId: id, guardianContactId: tok.contactId, method: r.method as string } });
      // Tell the other asked guardians it was cancelled (rule 9) — emails only, best effort.
      const others = (r.asked_contact_ids as string[]).filter((x) => x !== tok.contactId);
      if (others.length) {
        const { data: cs } = await db.from("contacts").select("email").in("id", others);
        const emails = (cs ?? []).map((x: any) => x.email).filter(Boolean) as string[];
        if (emails.length) await sendEmail(emails, "Alarm cancelled", `<p>The alarm was cancelled by ${escapeHtml(name)}. Monitoring continues.</p>`);
      }
    } else {
      await logEvent({ journeyId: r.journey_id, type: "cancel_vote", payload: { requestId: id, contactId: tok.contactId, safe, verdict } });
    }

    return respond(applied.state);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[cancel-request/vote]", e);
    return new Response("error", { status: 500 });
  }
}
