import { requireUser } from "@/lib/auth";
import { admin } from "@/lib/supabaseAdmin";
import { applyEvent } from "@/lib/journeyState";
import { logEvent } from "@/lib/events";
import { askGroup, cancelGroups, reachableContacts } from "@/lib/cancelRetry";
import type { CancelMethod } from "@vaira/core";
import { liveDistress } from "@/lib/guardianEnd";

const METHODS = new Set<CancelMethod>(["word", "photo", "video"]);

// ADR-043 step 3/4: the owner opens a guardian cancel request. Owner only. Picks
// up to 3 guardians (primary/emergency tier first, then buffer, first 3 with a
// reachable channel), writes the cancel_requests row, asks each guardian over the
// NORMAL push channel + email with a per-guardian signed vote link (never the loud
// alarm channel, silent or not — this is a "confirm she's safe" ask), then moves
// the cancel request through the pure protocol. The alarm stays CRITICAL (Fix AD
// round 2); the deadman tick runs the resend and the 30-minute cycles (cancelRetry).
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const { journeyId, method, mediaPath, alarmMode } = await req.json();
    if (!journeyId || !METHODS.has(method)) return new Response("bad request", { status: 400 });
    // Photo/video cancels must carry their own media, and it must live under this
    // journey's cancel prefix inside HER OWN folder (<uid>/cancel/<journeyId>/, founder
    // Q79; the selfies insert policy needs folder 1 = auth.uid()) — a path from another
    // user or another journey is rejected (no cross read of someone else's selfies).
    if (method !== "word") {
      if (typeof mediaPath !== "string" || !mediaPath.startsWith(`${user.id}/cancel/${journeyId}/`))
        return new Response("bad media path", { status: 400 });
    }

    const db = admin();
    const { data: j } = await db.from("journeys").select("owner_id, from_label, to_label, alarm_mode, status").eq("id", journeyId).single();
    if (!j) return new Response("not found", { status: 404 });
    if (j.owner_id !== user.id) return new Response("forbidden", { status: 403 });

    // Fix lane F2 (founder 2026-11-12): after the emergency word, while that alarm is live, her own
    // account cannot open a new "Is she safe?" question. No new row is written and no guardian is
    // messaged. Only a guardian who has spoken to her ends it (guardian-end route). Reuses the one
    // definition of "emergency-word alarm live" (guardianEnd.liveDistress) so the two cannot drift.
    if ((await liveDistress(db, journeyId)).ok)
      return new Response("the emergency-word alarm is not cancellable here", { status: 409 });

    // ADR-043: a cancel request is only meaningful while an alarm is actually
    // running. Load the current protocol state the same way journeyState does
    // (latest journey_state row) and refuse on any non-alarm state — a SAFE,
    // RESOLVED or already-cancelled journey must never ask guardians "Is she
    // safe?" for no alarm. `status === "expired"` (set by the dead-man watchdog
    // without a state_change) is NOT refused: an offline retry must still succeed
    // after the 15-min expiry (Fix AD round 2, point 9).
    const { data: st } = await db
      .from("journey_state")
      .select("state")
      .eq("journey_id", journeyId)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const pstate = (st?.state as string) ?? "IDLE";
    const onAlarm = pstate === "CRITICAL" || pstate === "CANCEL_HOLD";
    if (!onAlarm || j.status === "done")
      return new Response("journey is not in a cancellable alarm state", { status: 409 });

    // Her phone holds the true mode: a silent SOS raised offline may not have reached the row.
    if ((alarmMode === "siren" || alarmMode === "silent") && alarmMode !== j.alarm_mode) {
      await db.from("journeys").update({ alarm_mode: alarmMode }).eq("id", journeyId);
      j.alarm_mode = alarmMode;
    }

    // Idempotent reopen: a wearer's phone in a retry loop must not open N requests
    // (each notifying 3 guardians). If an unresolved request already exists for
    // this journey, return it unchanged — no second row, no re-notify.
    const { data: open } = await db
      .from("cancel_requests")
      .select("id, asked_contact_ids")
      .eq("journey_id", journeyId)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (open?.id) return Response.json({ requestId: open.id, asked: (open.asked_contact_ids as string[]) ?? [] });

    // Guardian pick: the first group (tier, then position, first 3 reachable).
    const asked = cancelGroups(await reachableContacts(db, j.owner_id))[0] ?? [];
    const askedIds = asked.map((c: any) => c.id);

    const { data: row } = await db
      .from("cancel_requests")
      .insert({ journey_id: journeyId, owner_id: j.owner_id, method, media_path: mediaPath ?? null, asked_contact_ids: askedIds })
      .select("id")
      .single();
    const requestId = (row as { id?: string } | null)?.id ?? null;
    if (!requestId) return new Response("error", { status: 500 });

    // Saved before the sends so a run cut off mid-way is retried by the clock. Separate from the
    // insert: a failure here (before 0032) must never cost her the request.
    await db.from("cancel_requests").update({ ask_pending_ids: askedIds }).eq("id", requestId);
    const missed = await askGroup(db, journeyId, requestId, j, asked, false);
    await db.from("cancel_requests").update({ ask_pending_ids: missed }).eq("id", requestId);

    await applyEvent(journeyId, { type: "CANCEL_REQUESTED", method }, "user");
    await logEvent({ journeyId, type: "cancel_request_opened", payload: { requestId, method, askedIds, alarmMode: j.alarm_mode } });
    return Response.json({ requestId, asked: askedIds });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[cancel-request]", e);
    return new Response("error", { status: 500 });
  }
}
