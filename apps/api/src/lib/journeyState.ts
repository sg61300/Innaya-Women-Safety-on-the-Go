import { transition, type ProtocolContext, type ProtocolEvent, type ProtocolState, type Action, type ChallengeKind, type AlarmMode } from "@vaira/core";
import { admin } from "./supabaseAdmin";
import { logEvent } from "./events";
import { notifyGuardians, notifyNearby } from "./alerts";

// Guardian-facing copy per state (Design/02). Only the states that fan out have copy.
const COPY: Partial<Record<ProtocolState, [string, string]>> = {
  AMBER: ["Possible distress", "We're checking on her. You'll hear again within 5 minutes."],
  EMERGENCY: ["She may be in danger", "Siren is on and her location is live. Open the app now."],
  CRITICAL: ["Urgent: she needs help", "No response from her. Location and feed are live. Please act now."],
  // ADR-043: the cancel-request ask ("confirm she is safe") and the "cancelled by
  // <name>" message are sent by the /api/cancel-request routes (they need the <=3
  // asked guardians, the signed link, the request id and the canceller's name), so
  // the CANCEL_HOLD / RESOLVED_MONITORING transitions fan out NOTHING from here.
};

// Injectable dependencies (F3). Default = the module's real deps; tests pass fakes.
export interface ApplyEventDeps {
  db: ReturnType<typeof admin>;
  logEvent: typeof logEvent;
  notifyGuardians: typeof notifyGuardians;
  notifyNearby: typeof notifyNearby;
}
const realDeps = (): ApplyEventDeps => ({ db: admin(), logEvent, notifyGuardians, notifyNearby });

// Fix lane F1 (founder 2026-11-12): the guardian Safe (vote, verdict cancel) and the guardian
// end action pass this so the state move happens in the SAME database step that closes the
// cancel request row (0036 function). `claimMode` 'open' claims a still-open row (normal Safe);
// 'distress' claims the newest emergency-word row (guardian end). `closeSiblings` closes every
// other open cycle of the journey (normal Safe only). Every other applyEvent caller leaves it
// unset and keeps today's behaviour exactly.
export type AtomicClaim = { requestId: string; claimMode: "open" | "distress"; closeSiblings: boolean };

// The guardian fan-out for a transition, shared by the normal and the atomic path so the two
// cannot drift. For CANCEL_HOLD / RESOLVED_MONITORING this sends nothing (COPY has no entry):
// the cancel routes send the "cancelled by <name>" message themselves (ADR-043).
async function fanOut(
  journeyId: string,
  state: ProtocolState,
  actions: Action[],
  ev: ProtocolEvent,
  notifyGuardians: ApplyEventDeps["notifyGuardians"],
  notifyNearby: ApplyEventDeps["notifyNearby"],
): Promise<void> {
  const copy = COPY[state];
  if (
    actions.some(
      (a) =>
        a === "NOTIFY_GUARDIANS_AMBER" ||
        a === "NOTIFY_ALL_EMERGENCY" ||
        a === "NOTIFY_ALL_CRITICAL"
    ) &&
    copy
  )
    await notifyGuardians(journeyId, state, copy[0], copy[1]);
  if (actions.includes("NOTIFY_NEARBY")) await notifyNearby(journeyId);

  // Guardian copy for the new ADR-038/039/040 notify actions, after the state
  // COPY fan-out above so each action produces exactly one guardian message.
  const EXTRA: Partial<Record<Action, [string, string]>> = {
    NOTIFY_GUARDIANS_CAMERA_PAUSED: ["Camera paused by her (verified)", "She paused the camera with her safe word. We're still listening and sharing her location."],
    NOTIFY_GUARDIANS_CAMERA_RESUMED: ["Camera back on", "She resumed the camera."],
    NOTIFY_GUARDIANS_STOPPED: ["She has stopped", ev.type === "STATIONARY" && ev.tier === 2 ? "In one place for 30 min. We're asking for her safe word now." : "In one place for 15 min. Watching her location."],
    NOTIFY_GUARDIANS_ROUTE: ["Route check", ev.type === "ROUTE_DEVIATION" && ev.kind === "away" ? "She's moving away from her destination. We're asking for her safe word." : ev.type === "CHALLENGE_PASSED" ? "She confirmed she's safe after moving away from her destination." : "Her route has changed. We're asking for her safe word."],
    NOTIFY_GUARDIANS_CAP: ["Journey ended automatically", "Monitoring reached its time limit, no alarm. She'll confirm with her safe word."],
  };
  for (const a of actions) { const c = EXTRA[a]; if (c) await notifyGuardians(journeyId, state, c[0], c[1]); }
}

// Server-authoritative protocol step: read the current state, run the pure core
// `transition`, persist the new state + journey flags, log both the protocol event
// and the state change, then fan out alerts for the actions the transition emits.
// `opts.cancelWaiting` (fix lane D5, founder Q125): the guardian end action after the emergency
// word has no open request to read, yet must end the alarm exactly as an approved Safe does.
export async function applyEvent(journeyId: string, ev: ProtocolEvent, actor: string, deps: ApplyEventDeps = realDeps(), opts: { cancelWaiting?: boolean; atomicClaim?: AtomicClaim } = {}): Promise<{ state: ProtocolState; actions: Action[]; claimed?: boolean; outcome?: "applied" | "claim_lost" | "no_change" }> {
  const { db, logEvent, notifyGuardians, notifyNearby } = deps;
  const { data: last } = await db
    .from("journey_state")
    .select("state")
    .eq("journey_id", journeyId)
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: j } = await db.from("journeys").select("ending, heightened, camera_paused_at, challenge_kind, alarm_mode").eq("id", journeyId).single();
  // `heightened` is persisted (migration 0008): it gates the core's SCORE=1 and
  // GUARDIAN_SAYS_WRONG → EMERGENCY escalations after a guardian-confirmed cancel.
  // `camera_paused_at` / `challenge_kind` (migration 0021, ADR-038/039) let a
  // restarted app resume the open pause/challenge and still escalate on timeout.
  // Fix AD round 2: "waiting on guardians" is simply an open cancel request on a CRITICAL
  // alarm. Read from the row so it needs no journeys column and cannot drift.
  const curState = (last?.state as ProtocolState) ?? "IDLE";
  const { data: openReq } = curState === "CRITICAL"
    ? await db.from("cancel_requests").select("id").eq("journey_id", journeyId).is("resolved_at", null).limit(1).maybeSingle()
    : { data: null };
  const ctx: ProtocolContext = {
    ...(openReq || (opts.cancelWaiting && curState === "CRITICAL") ? { cancelWaiting: true } : {}),
    state: curState,
    ending: Boolean(j?.ending),
    heightened: Boolean(j?.heightened),
    cameraPaused: Boolean(j?.camera_paused_at),
    challenge: ((j as { challenge_kind?: ChallengeKind | null })?.challenge_kind) ?? null,
    // ADR-043: the wearer's chosen alarm mode, persisted on the journey. Defaults
    // to "siren" so every pre-ADR-043 journey keeps the ADR-013 loud behaviour.
    alarmMode: (((j as { alarm_mode?: AlarmMode | null })?.alarm_mode) ?? "siren"),
  };
  const r = transition(ctx, ev);

  // Her own SOS while waiting ends the request: no more resends, no late Safe.
  if (ev.type === "SOS" && ctx.cancelWaiting)
    await db.from("cancel_requests").update({ verdict: "keep", resolved_at: new Date().toISOString() }).eq("journey_id", journeyId).is("resolved_at", null);

  // Founder Q116: the emergency word closes it quietly. The alert goes out below; no Safe
  // can end the alarm now, because the vote route refuses a row closed this way.
  if (ev.type === "KEYWORD" && ctx.cancelWaiting)
    await db.from("cancel_requests").update({ verdict: "distress", resolved_at: new Date().toISOString() }).eq("journey_id", journeyId).is("resolved_at", null);

  // Fix lane F1 (founder 2026-11-12): the guardian Safe (vote cancel) and the guardian end action
  // close the cancel request row and move the alarm state in ONE database step (0036 function), so
  // no reader can see the row closed while the alarm is still on. The core above already decided
  // r.ctx (the state + flags); this only writes that decision, conditional on the row still being
  // claimable. No protocol logic runs in SQL. Every other caller skips this (opts.atomicClaim unset).
  if (opts.atomicClaim) {
    if (r.ctx.state === ctx.state) {
      // The core kept the state (the alarm is no longer CRITICAL, say): nothing to claim or move.
      return { state: r.ctx.state, actions: r.actions, claimed: false, outcome: "no_change" };
    }
    const prevPausedAt = (j as { camera_paused_at?: string | null })?.camera_paused_at ?? null;
    const { data: moved, error } = await db.rpc("cancel_resolve_and_move", {
      p_journey_id: journeyId,
      p_request_id: opts.atomicClaim.requestId,
      p_claim_mode: opts.atomicClaim.claimMode,
      p_close_siblings: opts.atomicClaim.closeSiblings,
      p_state: r.ctx.state,
      p_reason: r.reason,
      p_actor: actor,
      p_status: r.ctx.state === "RESOLVED" ? "done" : "monitoring",
      p_ending: r.ctx.ending,
      p_heightened: r.ctx.heightened,
      p_challenge_kind: r.ctx.challenge,
      p_camera_paused_at: r.ctx.cameraPaused ? (prevPausedAt ?? new Date().toISOString()) : null,
      p_alarm_mode: r.ctx.alarmMode,
    });
    // supabase-js does NOT throw on a DB error (missing function, timeout, failure): it returns
    // { data: null, error }. A step that errored must NOT read as claim_lost ("already decided") -
    // that would hide a real failure and leave the alarm wrong. Log it clearly and throw so the
    // routes' 500 path runs (brief T10: step fails -> nobody told cancelled, error logged).
    if (error) {
      console.error("[journeyState] cancel_resolve_and_move failed", { journeyId, requestId: opts.atomicClaim.requestId, claimMode: opts.atomicClaim.claimMode, error: error.message });
      throw new Error(`cancel_resolve_and_move failed: ${error.message}`);
    }
    const claimed = Array.isArray(moved) ? Boolean((moved[0] as { claimed?: boolean } | undefined)?.claimed) : Boolean((moved as { claimed?: boolean } | null)?.claimed);
    if (!claimed) {
      // The row was closed first (emergency word / keep / another guardian): the alarm did not move.
      const { data: cur } = await db.from("journey_state").select("state").eq("journey_id", journeyId).order("changed_at", { ascending: false }).limit(1).maybeSingle();
      return { state: (cur?.state as ProtocolState) ?? ctx.state, actions: r.actions, claimed: false, outcome: "claim_lost" };
    }
    await logEvent({ journeyId, type: "protocol_event", payload: { ev, from: ctx.state, to: r.ctx.state, reason: r.reason, actions: r.actions, actor } });
    await logEvent({ journeyId, type: "state_change", payload: { from: ctx.state, to: r.ctx.state, reason: r.reason } });
    await fanOut(journeyId, r.ctx.state, r.actions, ev, notifyGuardians, notifyNearby);
    return { state: r.ctx.state, actions: r.actions, claimed: true, outcome: "applied" };
  }

  await logEvent({ journeyId, type: "protocol_event", payload: { ev, from: ctx.state, to: r.ctx.state, reason: r.reason, actions: r.actions, actor } });

  // Persist all journey flags in one place. camera_paused_at keeps the original
  // pause timestamp; a fresh pause with no stored time gets `now`.
  const prevPausedAt = (j as { camera_paused_at?: string | null })?.camera_paused_at ?? null;
  const flags = (c: ProtocolContext) => ({
    ending: c.ending,
    heightened: c.heightened,
    challenge_kind: c.challenge,
    camera_paused_at: c.cameraPaused ? (prevPausedAt ?? new Date().toISOString()) : null,
    alarm_mode: c.alarmMode,
  });
  const changed = r.ctx.ending !== ctx.ending || r.ctx.heightened !== ctx.heightened || r.ctx.cameraPaused !== ctx.cameraPaused || r.ctx.challenge !== ctx.challenge || r.ctx.alarmMode !== ctx.alarmMode;

  if (r.ctx.state !== ctx.state) {
    await db.from("journey_state").insert({ journey_id: journeyId, state: r.ctx.state, reason: r.reason, changed_by: actor });
    await db.from("journeys").update({ status: r.ctx.state === "RESOLVED" ? "done" : "monitoring", ...flags(r.ctx) }).eq("id", journeyId);
    await logEvent({ journeyId, type: "state_change", payload: { from: ctx.state, to: r.ctx.state, reason: r.reason } });
  } else if (changed) {
    await db.from("journeys").update(flags(r.ctx)).eq("id", journeyId);
  }

  await fanOut(journeyId, r.ctx.state, r.actions, ev, notifyGuardians, notifyNearby);

  return { state: r.ctx.state, actions: r.actions };
}
