import { admin } from "@/lib/supabaseAdmin";
import { applyEvent } from "@/lib/journeyState";
import { logEvent } from "@/lib/events";
import { sendEmail, escapeHtml } from "@/lib/alerts";
import { verifyCancelVoteToken } from "@/lib/token";
import { cancelSafeOpen, cancelVerdict, type AlarmMode, type ProtocolEvent } from "@vaira/core";

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
      .select("id, journey_id, owner_id, asked_contact_ids, method, verdict, resolved_at, created_at")
      .eq("id", id)
      .single();
    if (!r) return new Response("not found", { status: 404 });
    if (!(r.asked_contact_ids as string[]).includes(tok.contactId)) return new Response("forbidden", { status: 403 });

    // Fix AD round 2 (founder Q99, Q100): a Safe counts only inside the group's window
    // + 5 min, dropped groups included, and never on a request closed without a cancel
    // (keep verdict, her own SOS). "Not safe" stays accepted on an open row. On a closed
    // row it is refused and nothing changes, with one exception, today's overturn: the row
    // a Safe was given on still takes Not safe, so 2 of them can re-raise (ADR-043).
    const closedNoCancel = !!r.resolved_at && r.verdict !== "cancel";
    let refused = safe && (closedNoCancel || !cancelSafeOpen(new Date(r.created_at as string).getTime(), Date.now()));
    // F9 (founder "Yes, same as Safe"): a guardian END closes the row as 'cancel' with NO Safe vote
    // (migration 0036, distress claim). It stands in for the Safe that cancelled, so two "Not safe"
    // overturn it exactly as they overturn a Safe. Detected by its own audit event, tied to this row.
    let endedByGuardian = false;
    if (!safe && r.resolved_at) {
      const { data: safeHere } = r.verdict === "cancel"
        ? await db.from("cancel_votes").select("safe").eq("request_id", id).eq("safe", true).limit(1)
        : { data: null };
      if (r.verdict === "cancel") {
        const { data: endEvents } = await db.from("events").select("payload").eq("journey_id", r.journey_id).eq("type", "guardian_ended_alarm");
        endedByGuardian = ((endEvents ?? []) as { payload?: { requestId?: string } }[]).some((e) => e.payload?.requestId === id);
      }
      refused = !safeHere?.length && !endedByGuardian;
      // A later alarm's closed request (emergency word, keep) is not overturned by an old row.
      if (!refused) {
        const { data: newest } = await db.from("cancel_requests").select("verdict").eq("journey_id", r.journey_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        refused = newest?.verdict !== "cancel";
      }
    }
    const refuse = async () => {
      await logEvent({ journeyId: r.journey_id, type: "cancel_vote_refused", payload: { requestId: id, contactId: tok.contactId, safe } });
      if ((req.headers.get("accept") ?? "").includes("text/html"))
        return new Response(`<!doctype html><meta charset="utf-8"><title>Closed</title><body style="font:16px system-ui;padding:2rem"><p>This request has closed. The alarm was not changed.</p></body>`, { status: 410, headers: { "content-type": "text/html; charset=utf-8" } });
      return Response.json({ verdict: "refused", state: null }, { status: 410 });
    };
    if (refused) return await refuse();

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
    const recorded = (voteRows ?? []).map((v: any) => ({ safe: v.safe as boolean }));
    // F9: the guardian END is the Safe that already cancelled, so it leads the vote list and two
    // "Not safe" compute to reraise just as they do after a real Safe vote.
    const votes = endedByGuardian ? [{ safe: true }, ...recorded] : recorded;
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

    // Fix lane F1 (founder 2026-11-12): the Safe closes the row AND turns the alarm off in ONE
    // database step (0036). The core reads cancelWaiting from the still-open row and yields
    // RESOLVED_MONITORING + heightened; applyEvent writes both atomically. A row an emergency word
    // or a keep closed first is not claimable, so a late Safe cannot override it (decision 4).
    if (verdict === "cancel") {
      const applied = await applyEvent(
        r.journey_id,
        { type: "GUARDIAN_VOTE", safe: true, contactId: tok.contactId },
        "trustee",
        undefined,
        { atomicClaim: { requestId: id, claimMode: "open", closeSiblings: true } },
      );
      if (applied.claimed !== true) {
        // Another guardian's same Safe got there first (idempotent success), or the row closed
        // under us (refuse) — exactly the two outcomes of the old claim-then-apply order.
        const { data: now } = await db.from("cancel_requests").select("verdict").eq("id", id).single();
        if (now?.verdict !== "cancel") return await refuse();
        const { data: cur } = await db.from("journey_state").select("state").eq("journey_id", r.journey_id).order("changed_at", { ascending: false }).limit(1).maybeSingle();
        return respond((cur?.state as string) ?? null);
      }
      await db.from("alerts").insert({ journey_id: r.journey_id, recipient: tok.contactId, channel: "admin", state: applied.state });
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
      return respond(applied.state);
    }

    const { data: j } = await db.from("journeys").select("alarm_mode").eq("id", r.journey_id).single();
    const alarmMode = ((j?.alarm_mode as AlarmMode) ?? "siren");

    // verdict === "cancel" is handled by the atomic branch above and has already returned.
    const ev: ProtocolEvent =
      verdict === "keep" ? { type: "GUARDIAN_SAYS_WRONG" }
      : verdict === "reraise" ? { type: "SOS", mode: alarmMode }
      : { type: "GUARDIAN_VOTE", safe: false, contactId: tok.contactId }; // pending: log the vote, no state change
    const resolved = verdict !== "pending";
    // The row is claimed BEFORE the state moves: an emergency word or a keep that closed it while
    // this vote was on its way wins, in the row and in the state. Only a row a Safe closed may
    // take the overturn. Pending never touches resolved_at and only marks a row still open.
    const before = { verdict: r.verdict ?? null, resolved_at: r.resolved_at ?? null };
    if (resolved) {
      const claim = db.from("cancel_requests").update({ verdict, resolved_at: new Date().toISOString() }).eq("id", id);
      const { data: claimed } = await (verdict === "reraise" && r.resolved_at ? claim.eq("verdict", "cancel") : claim.is("resolved_at", null)).select("id");
      if (!claimed?.length) {
        const { data: now } = await db.from("cancel_requests").select("verdict").eq("id", id).single();
        if (now?.verdict !== verdict) return await refuse();
        const { data: cur } = await db.from("journey_state").select("state").eq("journey_id", r.journey_id).order("changed_at", { ascending: false }).limit(1).maybeSingle();
        return respond((cur?.state as string) ?? null); // another guardian's same answer got there first
      }
    } else await db.from("cancel_requests").update({ verdict }).eq("id", id).is("resolved_at", null);
    let applied: Awaited<ReturnType<typeof applyEvent>>;
    try {
      applied = await applyEvent(r.journey_id, ev, "trustee");
    } catch (e) {
      // The state did not move: the claim goes back, or a retry would stop at "already decided".
      if (resolved) await db.from("cancel_requests").update(before).eq("id", id).eq("verdict", verdict);
      throw e;
    }
    // Her phone reads the newest row, which may be a later cycle closed with this Safe.
    if (verdict === "reraise") await db.from("cancel_requests").update({ verdict }).eq("journey_id", r.journey_id).eq("verdict", "cancel").gte("created_at", r.created_at);
    // A decision closes every cycle of this journey, so no resend or dropped-group link
    // outlives it and her phone sees the verdict on whichever row is newest.
    if (resolved) await db.from("cancel_requests").update({ verdict, resolved_at: new Date().toISOString() }).eq("journey_id", r.journey_id).is("resolved_at", null);
    await db.from("alerts").insert({ journey_id: r.journey_id, recipient: tok.contactId, channel: "admin", state: applied.state });

    // Only keep / reraise / pending reach here (cancel returned in the atomic branch above).
    await logEvent({ journeyId: r.journey_id, type: "cancel_vote", payload: { requestId: id, contactId: tok.contactId, safe, verdict } });

    return respond(applied.state);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[cancel-request/vote]", e);
    return new Response("error", { status: 500 });
  }
}
