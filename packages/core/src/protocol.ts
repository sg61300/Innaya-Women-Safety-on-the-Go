import type { Action, ProtocolContext, ProtocolEvent, TransitionResult } from "./types";

export function initialContext(): ProtocolContext { return { state: "IDLE", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" }; }

const ENTER: Record<string, Action[]> = {
  AMBER: ["START_CHALLENGE", "NOTIFY_GUARDIANS_AMBER", "FRAME_FAST"],
  EMERGENCY: ["SIREN_ON", "NOTIFY_ALL_EMERGENCY", "START_LIVE", "FRAME_FAST", "START_CHALLENGE"],
  CRITICAL: ["SIREN_ON", "NOTIFY_ALL_CRITICAL", "NOTIFY_NEARBY", "START_LIVE", "FRAME_FAST"],
  // ADR-043: CANCEL_HOLD ("cancel request open") and the cancel-approved edge build
  // their own actions in `step` because they depend on alarmMode. SIREN_ON above is
  // stripped by `transition` whenever alarmMode === "silent".
  RESOLVED_MONITORING: ["SIREN_OFF", "FRAME_FAST"],
  LATE_CHECK: ["CALL_GUARDIAN", "NOTIFY_GUARDIANS_AMBER"],
  RESOLVED: ["SIREN_OFF", "ASK_FEEDBACK"],
};

const MONITORING = new Set<ProtocolContext["state"]>(["SAFE", "AMBER", "EMERGENCY", "LATE_CHECK", "RESOLVED_MONITORING"]);

function to(state: ProtocolContext["state"], reason: string, extra: Action[] = [], ctx?: Partial<ProtocolContext>): TransitionResult {
  return { ctx: { state, ending: ctx?.ending ?? false, heightened: ctx?.heightened ?? false, cameraPaused: ctx?.cameraPaused ?? false, challenge: null, alarmMode: ctx?.alarmMode ?? "siren" }, actions: [...(ENTER[state] ?? []), ...extra], reason };
}

// ADR-043 majority rule (pure). Votes are in arrival order. "First Safe cancels";
// two or more "Not safe" keep the alarm on, and if that second "Not safe" lands
// after a "Safe" already cancelled, the alarm is re-raised. Otherwise pending.
export function cancelVerdict(votes: { safe: boolean }[], totalAsked: number): "cancel" | "keep" | "reraise" | "pending" {
  const notSafe = votes.filter((v) => !v.safe).length;
  const anySafe = votes.some((v) => v.safe);
  if (notSafe >= 2) {
    // a "Safe" before the second "Not safe" means a cancel was granted then overturned
    let seenNotSafe = 0, safeBeforeSecondNo = false;
    for (const v of votes) {
      if (v.safe) { if (seenNotSafe < 2) safeBeforeSecondNo = true; }
      else { seenNotSafe++; if (seenNotSafe === 2) break; }
    }
    return safeBeforeSecondNo ? "reraise" : "keep";
  }
  if (anySafe) return "cancel";
  // Generalise the 3-guardian rule faithfully: when every asked guardian has
  // voted and none said Safe, the cancel is refused (keep). Fewer than all asked
  // (or nobody asked yet) stays pending until the rest answer or the 30 s timeout.
  if (totalAsked > 0 && votes.length >= totalAsked) return "keep";
  return "pending";
}
const stay = (ctx: ProtocolContext, reason: string, actions: Action[] = []): TransitionResult => ({ ctx, actions, reason });
const arrival = (ctx: ProtocolContext, reason: string): TransitionResult => ({ ctx: { ...ctx, ending: true }, actions: ["ARRIVAL_PROMPT"], reason });

function step(ctx: ProtocolContext, ev: ProtocolEvent): TransitionResult {
  const s = ctx.state;
  if (s === "RESOLVED") return stay(ctx, "resolved");
  const keep = { heightened: ctx.heightened, cameraPaused: ctx.cameraPaused, alarmMode: ctx.alarmMode };

  // ADR-038: verified camera pause / resume (no state change; guards run before the escalation blocks)
  if (ev.type === "SENSOR_LOST" && ev.sensor === "cam" && ctx.cameraPaused) return stay(ctx, "camera paused");
  if (ev.type === "SENSOR_PAUSE_REQUEST" && (s === "SAFE" || s === "AMBER" || s === "RESOLVED_MONITORING"))
    return { ctx: { ...ctx, challenge: "pause" }, actions: ["START_CHALLENGE_PAUSE"], reason: "camera pause requested" };
  if (ev.type === "SENSOR_RESUME" && ctx.cameraPaused)
    return { ctx: { ...ctx, cameraPaused: false }, actions: ["CAMERA_RESUME", "NOTIFY_GUARDIANS_CAMERA_RESUMED"], reason: "camera resumed" };
  if (ev.type === "CHALLENGE_PASSED" && ev.pauseSensor === "cam" && ctx.challenge === "pause" && !ctx.ending)
    return { ctx: { ...ctx, cameraPaused: true, heightened: true, challenge: null }, actions: ["CAMERA_PAUSE", "HEIGHTENED_MODE", "NOTIFY_GUARDIANS_CAMERA_PAUSED"], reason: "camera paused (verified)" };

  // ADR-039/040: stationary tiers, monitoring cap, route deviation (additive; never lowers an alarm)
  const QUIET = new Set<ProtocolContext["state"]>(["SAFE", "RESOLVED_MONITORING"]);
  const openChallenge = (kind: "stationary"|"route"|"away", start: Action, notify: Action, reason: string): TransitionResult =>
    ctx.challenge || ctx.ending ? stay(ctx, `${reason} (challenge already open)`, [notify]) : { ctx: { ...ctx, challenge: kind }, actions: [start, notify], reason };

  if (ev.type === "STATIONARY") {
    if (s === "EMERGENCY" || s === "CRITICAL" || s === "CANCEL_HOLD") return stay(ctx, "stationary (alarm, log only)");
    if (ev.tier === 1 || !QUIET.has(s)) return stay(ctx, ev.tier === 1 ? "stopped 15 min" : "stopped 30 min (amber)", ["NOTIFY_GUARDIANS_STOPPED"]);
    return openChallenge("stationary", "START_CHALLENGE_STATIONARY", "NOTIFY_GUARDIANS_STOPPED", "stopped 30 min");
  }
  if (ev.type === "ROUTE_DEVIATION") {
    if (s === "EMERGENCY" || s === "CRITICAL" || s === "CANCEL_HOLD") return stay(ctx, "route deviation (alarm, log only)");
    if (!QUIET.has(s)) return stay(ctx, `route ${ev.kind} (amber)`, ["NOTIFY_GUARDIANS_ROUTE"]);
    return ev.kind === "detour" ? openChallenge("route", "START_CHALLENGE_ROUTE", "NOTIFY_GUARDIANS_ROUTE", "route detour")
                                : openChallenge("away", "START_CHALLENGE_AWAY", "NOTIFY_GUARDIANS_ROUTE", "moving away from destination");
  }
  if (ev.type === "MONITOR_CAP") {
    if (s === "SAFE" || s === "AMBER" || s === "RESOLVED_MONITORING") return { ctx: { ...ctx, ending: true, challenge: null }, actions: ["ARRIVAL_PROMPT", "NOTIFY_GUARDIANS_CAP"], reason: "monitoring cap" };
    return stay(ctx, "monitoring cap ignored (alarm or late check)");
  }
  if (ev.type === "CHALLENGE_PASSED" && ctx.challenge && !ctx.ending && QUIET.has(s)) {
    const k = ctx.challenge;
    if (k === "away") return { ctx: { ...ctx, challenge: null, heightened: true }, actions: ["HEIGHTENED_MODE", "NOTIFY_GUARDIANS_ROUTE"], reason: "away challenge passed" };
    if (k === "stationary" || k === "route") return { ctx: { ...ctx, challenge: null }, actions: [], reason: `${k} challenge passed` };
  }

  // ADR-013: emergency word / help / SOS / SOS button → CRITICAL immediately,
  // regardless of journey. Fires from every monitoring state AND from IDLE/ARMED
  // (Home-screen SOS with no armed journey) — H5: SOS from Home was a no-op because
  // IDLE/ARMED fell through to the state switch, which only handled ARM/MONITOR_START.
  if ((ev.type === "KEYWORD" || ev.type === "SOS") && (MONITORING.has(s) || s === "IDLE" || s === "ARMED")) {
    const alarmMode = ev.type === "SOS" ? (ev.mode ?? "siren") : "siren";
    return to("CRITICAL", ev.type === "SOS" ? "sos" : `keyword ${ev.kind}`, [], { ...keep, alarmMode });
  }
  // ADR-043: SOS again while already in an alarm re-applies the mode. Pressing SOS
  // in silent mode switches to siren at once; a guardian-driven re-raise (step 7)
  // re-sends SOS with the stored mode to keep it. KEYWORD in CRITICAL is a no-op.
  if (ev.type === "SOS" && (s === "CRITICAL" || s === "CANCEL_HOLD"))
    return to("CRITICAL", "sos again", [], { ...keep, alarmMode: ev.mode ?? "siren" });

  // upward triggers valid in every monitoring state
  if (MONITORING.has(s)) {
    if (ev.type === "SCORE" && ev.score === 3) return to("CRITICAL", "score 3", [], keep);
    if (ev.type === "SENSOR_LOST" && !ev.batteryLow) return to("CRITICAL", `sensor ${ev.sensor} lost`, [], keep);
    if (ev.type === "HEARTBEAT_GAP") return to("CRITICAL", "heartbeat gap", [], keep);
    if (ev.type === "SCORE" && ev.score === 2 && s !== "EMERGENCY") return to("EMERGENCY", "score 2", [], keep);
    if (ctx.heightened && ev.type === "SCORE" && ev.score === 1) return to("EMERGENCY", "score 1 in heightened mode", [], keep);
    if (ctx.heightened && ev.type === "GUARDIAN_SAYS_WRONG") return to("EMERGENCY", "guardian raised alarm (heightened)", [], keep);
  }

  switch (s) {
    case "IDLE":
      return ev.type === "ARM" ? to("ARMED", "armed", ["SHARE_LOCATION"]) : stay(ctx, "idle");
    case "ARMED":
      return ev.type === "MONITOR_START" ? to("SAFE", "monitoring") : stay(ctx, "armed");
    case "SAFE":
    case "RESOLVED_MONITORING":
      switch (ev.type) {
        case "SCORE": return ev.score === 1 ? to("AMBER", "score 1", [], keep) : stay(ctx, "score 0");
        case "SENSOR_LOST": return to("AMBER", `sensor ${ev.sensor} lost (battery)`, [], keep);
        case "DANGER_ZONE_ENTER": return to("AMBER", "danger zone", [], keep);
        case "GUARDIAN_CONCERN": return to("AMBER", "guardian concern", [], keep);
        case "PLAN_CHANGE": return to("AMBER", "plan change", [], keep);
        case "ARRIVED": case "END": return arrival(ctx, ev.type.toLowerCase());
        case "ARRIVAL_PROMPT_TIMEOUT": return ctx.ending ? stay(ctx, "arrival prompt unanswered", ["START_CHALLENGE"]) : stay(ctx, "ignored");
        case "LATE": return to("LATE_CHECK", "expected duration passed", [], keep);
        case "CHALLENGE_PASSED": return ctx.ending ? to("RESOLVED", "arrived + safe word") : stay(ctx, "no challenge");
        case "CHALLENGE_TIMEOUT": return ctx.ending || ctx.challenge ? to("CRITICAL", ctx.ending ? "arrival challenge timeout" : `${ctx.challenge} challenge timeout`, [], keep) : stay(ctx, "no challenge");
        default: return stay(ctx, "ignored");
      }
    case "AMBER":
      switch (ev.type) {
        case "CHALLENGE_PASSED": return ctx.ending ? to("RESOLVED", "arrived + safe word") : stay(ctx, "challenge passed", ["START_RECONFIRM_TIMER"]);
        case "SIGNALS_SAFE": return to(ctx.heightened ? "RESOLVED_MONITORING" : "SAFE", "signals safe", ctx.heightened ? ["SIREN_OFF"] : ["FRAME_NORMAL", "SIREN_OFF"], keep);
        case "CHALLENGE_TIMEOUT": return to("CRITICAL", "challenge timeout", [], keep);
        case "RECONFIRM_MISSED": return to("CRITICAL", "reconfirm missed", [], keep);
        case "SENSOR_LOST": return stay(ctx, "sensor lost (battery)");
        case "END": case "ARRIVED": return arrival(ctx, ev.type.toLowerCase());
        case "LATE": return to("LATE_CHECK", "expected duration passed", [], keep);
        default: return stay(ctx, "ignored");
      }
    case "LATE_CHECK":
      switch (ev.type) {
        case "GUARDIAN_LATE_CONFIRM": return ev.safe ? to(ctx.heightened ? "RESOLVED_MONITORING" : "SAFE", "guardian confirmed on late call", ctx.heightened ? [] : ["FRAME_NORMAL"], keep) : to("CRITICAL", "guardian says wrong on late call", [], keep);
        case "CALL_FAILED": return to("CRITICAL", "nobody reachable on late call", [], keep);
        case "ARRIVED": return arrival({ ...ctx, state: "SAFE" }, "arrived during late check");
        default: return stay(ctx, "ignored");
      }
    case "EMERGENCY":
      switch (ev.type) {
        case "CHALLENGE_TIMEOUT": return to("CRITICAL", "emergency unconfirmed 5 s", [], keep);
        case "CHALLENGE_PASSED": return ev.guardianConfirmed ? to("AMBER", "safe word + guardian confirm", ["SIREN_OFF"], keep) : stay(ctx, "needs guardian confirm");
        default: return stay(ctx, "ignored");
      }
    case "CRITICAL":
      switch (ev.type) {
        // ADR-043 steps 1-2: app password / journey word are verified on the
        // wearer's phone and only logged server-side; they never move the alarm.
        case "CANCEL_STEP1_OK": case "CANCEL_STEP2_OK": return stay(ctx, `cancel ${ev.type === "CANCEL_STEP1_OK" ? "step 1" : "step 2"} ok`);
        // ADR-043 step 3/4: the guardian cancel request opens. The siren is only
        // held (not off) while the 30 s window is open, and only in siren mode.
        case "CANCEL_REQUESTED":
          return to("CANCEL_HOLD", `cancel request opened (${ev.method})`, ctx.alarmMode === "siren" ? ["NOTIFY_GUARDIANS_CANCEL_REQUEST", "SIREN_HOLD"] : ["NOTIFY_GUARDIANS_CANCEL_REQUEST"], keep);
        default: return stay(ctx, "critical holds");
      }
    case "CANCEL_HOLD":
      switch (ev.type) {
        // ADR-043 step 7: the first "Safe" cancels → heightened RESOLVED_MONITORING.
        case "GUARDIAN_VOTE": return ev.safe
          ? to("RESOLVED_MONITORING", "guardian approved cancel", ["HEIGHTENED_MODE", "NOTIFY_GUARDIANS_CANCELLED_BY"], { ...keep, heightened: true })
          : stay(ctx, "guardian voted not safe (request still open)");
        // Majority said keep (2+ "Not safe") → the alarm stays on.
        case "GUARDIAN_SAYS_WRONG": return to("CRITICAL", "guardians kept the alarm on", [], keep);
        // 30 s with no answer: siren mode starts/keeps the siren (stripped in silent); request stays open.
        case "CANCEL_TIMEOUT": return stay(ctx, "no guardian answer in 30 s", ["SIREN_ON"]);
        default: return stay(ctx, "cancel request open");
      }
  }
}

// ADR-038: any escalation into EMERGENCY/CRITICAL auto-resumes the camera.
export function transition(ctx: ProtocolContext, ev: ProtocolEvent): TransitionResult {
  const r = step(ctx, ev);
  let out = r;
  if (ctx.cameraPaused && (r.ctx.state === "EMERGENCY" || r.ctx.state === "CRITICAL") && r.ctx.state !== ctx.state)
    out = { ...r, ctx: { ...r.ctx, cameraPaused: false }, actions: [...r.actions, "CAMERA_RESUME"] };
  // ADR-043: a silent alarm never sounds the siren on the wearer's own phone.
  if (out.ctx.alarmMode === "silent" && out.actions.includes("SIREN_ON"))
    out = { ...out, actions: out.actions.filter((a) => a !== "SIREN_ON") };
  return out;
}
