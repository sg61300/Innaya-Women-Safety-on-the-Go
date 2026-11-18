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

// Server-authoritative protocol step: read the current state, run the pure core
// `transition`, persist the new state + journey flags, log both the protocol event
// and the state change, then fan out alerts for the actions the transition emits.
export async function applyEvent(journeyId: string, ev: ProtocolEvent, actor: string, deps: ApplyEventDeps = realDeps()): Promise<{ state: ProtocolState; actions: Action[] }> {
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
  const ctx: ProtocolContext = {
    state: (last?.state as ProtocolState) ?? "IDLE",
    ending: Boolean(j?.ending),
    heightened: Boolean(j?.heightened),
    cameraPaused: Boolean(j?.camera_paused_at),
    challenge: ((j as { challenge_kind?: ChallengeKind | null })?.challenge_kind) ?? null,
    // ADR-043: the wearer's chosen alarm mode, persisted on the journey. Defaults
    // to "siren" so every pre-ADR-043 journey keeps the ADR-013 loud behaviour.
    alarmMode: (((j as { alarm_mode?: AlarmMode | null })?.alarm_mode) ?? "siren"),
  };
  const r = transition(ctx, ev);

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

  const copy = COPY[r.ctx.state];
  if (
    r.actions.some(
      (a) =>
        a === "NOTIFY_GUARDIANS_AMBER" ||
        a === "NOTIFY_ALL_EMERGENCY" ||
        a === "NOTIFY_ALL_CRITICAL"
    ) &&
    copy
  )
    await notifyGuardians(journeyId, r.ctx.state, copy[0], copy[1]);
  if (r.actions.includes("NOTIFY_NEARBY")) await notifyNearby(journeyId);

  // Guardian copy for the new ADR-038/039/040 notify actions, after the state
  // COPY fan-out above so each action produces exactly one guardian message.
  const EXTRA: Partial<Record<Action, [string, string]>> = {
    NOTIFY_GUARDIANS_CAMERA_PAUSED: ["Camera paused by her (verified)", "She paused the camera with her safe word. We're still listening and sharing her location."],
    NOTIFY_GUARDIANS_CAMERA_RESUMED: ["Camera back on", "She resumed the camera."],
    NOTIFY_GUARDIANS_STOPPED: ["She has stopped", ev.type === "STATIONARY" && ev.tier === 2 ? "In one place for 30 min. We're asking for her safe word now." : "In one place for 15 min. Watching her location."],
    NOTIFY_GUARDIANS_ROUTE: ["Route check", ev.type === "ROUTE_DEVIATION" && ev.kind === "away" ? "She's moving away from her destination. We're asking for her safe word." : ev.type === "CHALLENGE_PASSED" ? "She confirmed she's safe after moving away from her destination." : "Her route has changed. We're asking for her safe word."],
    NOTIFY_GUARDIANS_CAP: ["Journey ended automatically", "Monitoring reached its time limit, no alarm. She'll confirm with her safe word."],
  };
  for (const a of r.actions) { const c = EXTRA[a]; if (c) await notifyGuardians(journeyId, r.ctx.state, c[0], c[1]); }

  return { state: r.ctx.state, actions: r.actions };
}
