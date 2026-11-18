import { requireUser } from "@/lib/auth";
import { admin } from "@/lib/supabaseAdmin";
import { applyEvent } from "@/lib/journeyState";
import { logEvent } from "@/lib/events";
import { sendPush, sendEmail, escapeHtml } from "@/lib/alerts";
import { signCancelVoteToken, signGuardianToken } from "@/lib/token";
import type { CancelMethod } from "@vaira/core";

const METHODS = new Set<CancelMethod>(["word", "photo", "video"]);

// ADR-043 step 3/4: the owner opens a guardian cancel request. Owner only. Picks
// up to 3 guardians (primary/emergency tier first, then buffer, first 3 with a
// reachable channel), writes the cancel_requests row, asks each guardian over the
// NORMAL push channel + email with a per-guardian signed vote link (never the loud
// alarm channel, silent or not — this is a "confirm she's safe" ask), then moves
// the journey CRITICAL → CANCEL_HOLD through the pure protocol.
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const { journeyId, method, mediaPath } = await req.json();
    if (!journeyId || !METHODS.has(method)) return new Response("bad request", { status: 400 });
    // Photo/video cancels must carry their own media, and it must live under this
    // journey's cancel prefix — a path from another journey is rejected (no cross
    // read of someone else's private selfies).
    if (method !== "word") {
      if (typeof mediaPath !== "string" || !mediaPath.startsWith(`cancel/${journeyId}/`))
        return new Response("bad media path", { status: 400 });
    }

    const db = admin();
    const { data: j } = await db.from("journeys").select("owner_id, from_label, to_label, alarm_mode, status").eq("id", journeyId).single();
    if (!j) return new Response("not found", { status: 404 });
    if (j.owner_id !== user.id) return new Response("forbidden", { status: 403 });

    // ADR-043: a cancel request is only meaningful while an alarm is actually
    // running. Load the current protocol state the same way journeyState does
    // (latest journey_state row) and refuse on any non-alarm state — a SAFE,
    // RESOLVED or already-cancelled journey must never ask guardians "Is she
    // safe?" for no alarm. `status === "expired"` (set by the dead-man watchdog
    // without a state_change) is caught here too.
    const { data: st } = await db
      .from("journey_state")
      .select("state")
      .eq("journey_id", journeyId)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const pstate = (st?.state as string) ?? "IDLE";
    const onAlarm = pstate === "CRITICAL" || pstate === "CANCEL_HOLD";
    if (!onAlarm || j.status === "expired" || j.status === "done")
      return new Response("journey is not in a cancellable alarm state", { status: 409 });

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

    // Guardian pick: tier (primary before buffer) then position, first 3 reachable.
    const { data: contacts } = await db
      .from("contacts")
      .select("id, email, linked_user_id, tier, position")
      .eq("owner_id", j.owner_id);
    const tierRank = (t: string) => (t === "primary" ? 0 : 1);
    const reachable = (c: any) => !!c.email || !!c.linked_user_id;
    const asked = (contacts ?? [])
      .filter(reachable)
      .sort((a: any, b: any) => tierRank(a.tier) - tierRank(b.tier) || (a.position ?? 0) - (b.position ?? 0))
      .slice(0, 3);
    const askedIds = asked.map((c: any) => c.id);

    const { data: row } = await db
      .from("cancel_requests")
      .insert({ journey_id: journeyId, owner_id: j.owner_id, method, media_path: mediaPath ?? null, asked_contact_ids: askedIds })
      .select("id")
      .single();
    const requestId = (row as { id?: string } | null)?.id ?? null;
    if (!requestId) return new Response("error", { status: 500 });

    // Notify each asked guardian on the normal channel with their own vote link.
    const base = process.env.APP_BASE_URL;
    const linkedIds = asked.map((c: any) => c.linked_user_id).filter(Boolean) as string[];
    const { data: profs } = linkedIds.length
      ? await db.from("profiles").select("id, expo_push_token").in("id", linkedIds)
      : { data: [] as { id: string; expo_push_token: string | null }[] };
    const tokenFor = new Map((profs ?? []).map((p: any) => [p.id, p.expo_push_token]));
    for (const c of asked) {
      const vt = signCancelVoteToken(requestId, c.id);
      const link = `${base}/g/${signGuardianToken(journeyId, c.id)}?cr=${requestId}&vt=${vt}`;
      const pushTok = c.linked_user_id ? (tokenFor.get(c.linked_user_id) as string | null | undefined) : null;
      if (pushTok)
        await sendPush([pushTok], "Is she safe? She's trying to cancel the alarm", "Open INNAYA to confirm she's safe or keep the alarm on.", { kind: "cancel_request", journeyId, requestId, link }); // normal channel (never vaira-alarm-2)
      if (c.email)
        await sendEmail([c.email], "Is she safe? Cancel request", `<p>${escapeHtml(j.from_label)} → ${escapeHtml(j.to_label)}</p><p>She is asking you to confirm she is safe.</p><p><a href="${link}">Open to vote Safe / Not safe</a></p>`);
    }

    await applyEvent(journeyId, { type: "CANCEL_REQUESTED", method }, "user");
    await logEvent({ journeyId, type: "cancel_request_opened", payload: { requestId, method, askedIds, alarmMode: j.alarm_mode } });
    return Response.json({ requestId, asked: askedIds });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[cancel-request]", e);
    return new Response("error", { status: 500 });
  }
}
