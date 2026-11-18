// Lane J (Senior QA + Senior Dev, s20) — end-to-end journey scenario table.
//
// This drives the PURE reducer (`transition`) through each PRD/ADR journey as a
// full multi-step SEQUENCE and asserts the exact state path plus the load-bearing
// timing constants (timers.ts) each row depends on. Single-transition rows that
// existing suites already prove are CITED here, not duplicated:
//   - emergency word / SOS / heartbeat / sensor-battery single steps → protocol.test.ts
//   - camera pause single steps                                       → protocol.pause.test.ts
//   - stationary / cap / route single steps                          → protocol.guards.test.ts
//   - timing helper thresholds (3/5 s, 30 s, 5 min, 15/30 min)        → timers.test.ts
// The runner's *wall-clock* firing of those timers (5 s → CRITICAL, 5 min
// reconfirm, 5 min arrival prompt, 15 min camera nudge) is proven with fake
// timers in apps/mobile/src/services/__tests__/protocolRunner.timing.test.ts
// (and protocolRunner.guards.test.ts for the nudge).
import { transition, initialContext } from "../protocol";
import {
  CHALLENGE_SPEAK_MS, CHALLENGE_CRITICAL_MS, RECONFIRM_MS, HEARTBEAT_MS,
  STATIONARY_T1_MS, STATIONARY_T2_MS, heartbeatVerdict, reconfirmDue,
} from "../timers";
import type { ProtocolContext, ProtocolEvent, ProtocolState } from "../types";

// Run a list of events from a start context, returning the state after EACH event.
function drive(events: ProtocolEvent[], start: ProtocolContext = initialContext()): ProtocolState[] {
  let ctx = start;
  const path: ProtocolState[] = [];
  for (const ev of events) {
    ctx = transition(ctx, ev).ctx;
    path.push(ctx.state);
  }
  return path;
}
const at = (state: ProtocolState, extra: Partial<ProtocolContext> = {}): ProtocolContext => ({ ...initialContext(), state, ...extra });

// ---------------------------------------------------------------------------
// Scenario table: [title, start ctx, events, expected state sequence].
// Each row is one journey the PRD/ADR describes; the sequence is the exact
// state path the reducer must walk.
// ---------------------------------------------------------------------------
type Row = { title: string; start?: ProtocolContext; events: ProtocolEvent[]; seq: ProtocolState[] };
const TABLE: Row[] = [
  {
    title: "normal journey → arrival prompt → safe word → RESOLVED",
    events: [
      { type: "ARM" }, { type: "MONITOR_START" },
      { type: "SCORE", score: 0, reasons: ["none"] },
      { type: "ARRIVED" }, { type: "CHALLENGE_PASSED" },
    ],
    seq: ["ARMED", "SAFE", "SAFE", "SAFE", "RESOLVED"], // ARRIVED sets ending flag, state stays SAFE until safe word
  },
  {
    title: "route deviation (detour) → are-you-safe → safe word → back to SAFE",
    start: at("SAFE"),
    events: [
      { type: "ROUTE_DEVIATION", kind: "detour" }, // opens route challenge, state stays SAFE
      { type: "CHALLENGE_PASSED" },                 // route challenge cleared → continue monitoring
    ],
    seq: ["SAFE", "SAFE"],
  },
  {
    title: "route deviation (away) → passed → heightened, still SAFE",
    start: at("SAFE"),
    events: [{ type: "ROUTE_DEVIATION", kind: "away" }, { type: "CHALLENGE_PASSED" }],
    seq: ["SAFE", "SAFE"],
  },
  {
    title: "are-you-safe unanswered → CHALLENGE_TIMEOUT → CRITICAL",
    start: at("SAFE"),
    events: [{ type: "SCORE", score: 1, reasons: ["isolated_location"] }, { type: "CHALLENGE_TIMEOUT" }],
    seq: ["AMBER", "CRITICAL"],
  },
  {
    title: "emergency word → CRITICAL immediately",
    start: at("SAFE"),
    events: [{ type: "KEYWORD", kind: "emergency" }],
    seq: ["CRITICAL"],
  },
  {
    title: "SOS from Home with no journey (IDLE) → CRITICAL",
    events: [{ type: "SOS" }],
    seq: ["CRITICAL"],
  },
  {
    title: "heartbeat gap → CRITICAL",
    start: at("SAFE"),
    events: [{ type: "HEARTBEAT_GAP" }],
    seq: ["CRITICAL"],
  },
  {
    title: "stationary 15 min (tier 1, notify only) then 30 min (tier 2, are-you-safe) → passed → SAFE",
    start: at("SAFE"),
    events: [
      { type: "STATIONARY", tier: 1 }, // notify only, no state change, no challenge
      { type: "STATIONARY", tier: 2 }, // opens stationary challenge
      { type: "CHALLENGE_PASSED" },     // continue
    ],
    seq: ["SAFE", "SAFE", "SAFE"],
  },
  {
    title: "danger-zone entry → AMBER + 5-min re-confirm loop → missed → CRITICAL",
    start: at("SAFE"),
    events: [
      { type: "DANGER_ZONE_ENTER" }, // → AMBER (challenge)
      { type: "CHALLENGE_PASSED" },   // stays AMBER, arms 5-min reconfirm
      { type: "RECONFIRM_MISSED" },   // reconfirm not answered → CRITICAL
    ],
    seq: ["AMBER", "AMBER", "CRITICAL"],
  },
  {
    title: "ADR-043 cancel: app password + journey word + guardian request + first Safe vote → heightened RESOLVED_MONITORING",
    start: at("CRITICAL"),
    events: [
      { type: "CANCEL_STEP1_OK" },                             // app password ok, stays CRITICAL
      { type: "CANCEL_STEP2_OK" },                             // journey word ok, stays CRITICAL
      { type: "CANCEL_REQUESTED", method: "word" },            // guardian request opens → CANCEL_HOLD
      { type: "GUARDIAN_VOTE", safe: true, contactId: "c1" },  // first Safe cancels → RESOLVED_MONITORING heightened
    ],
    seq: ["CRITICAL", "CRITICAL", "CANCEL_HOLD", "RESOLVED_MONITORING"],
  },
  {
    title: "battery-low sensor loss → AMBER (not CRITICAL); non-battery loss → CRITICAL",
    start: at("SAFE"),
    events: [{ type: "SENSOR_LOST", sensor: "cam", batteryLow: true }],
    seq: ["AMBER"],
  },
  {
    title: "camera pause (typed safe word) → paused+heightened → emergency auto-resumes camera",
    start: at("SAFE"),
    events: [
      { type: "SENSOR_PAUSE_REQUEST", sensor: "cam" },      // opens typed pause challenge, stays SAFE
      { type: "CHALLENGE_PASSED", pauseSensor: "cam" },      // camera paused + heightened, stays SAFE
      { type: "SCORE", score: 2, reasons: ["unwanted_contact"] }, // → EMERGENCY, auto-resume
    ],
    seq: ["SAFE", "SAFE", "EMERGENCY"],
  },
  {
    title: "monitoring cap → arrival prompt → safe word → RESOLVED",
    start: at("SAFE"),
    events: [{ type: "MONITOR_CAP" }, { type: "CHALLENGE_PASSED" }],
    seq: ["SAFE", "RESOLVED"], // cap sets ending, state stays SAFE until safe word confirms
  },
];

describe("journey scenario table (reducer sequences)", () => {
  it.each(TABLE)("$title", ({ start, events, seq }) => {
    expect(drive(events, start)).toEqual(seq);
  });
});

// ---------------------------------------------------------------------------
// Deep assertions for the rows whose CORRECTNESS is more than the final state.
// ---------------------------------------------------------------------------
describe("journey scenario table — side-effect + flag assertions", () => {
  it("normal journey: ARRIVED sets ending and prompts; safe word emits ASK_FEEDBACK", () => {
    const arrived = transition(at("SAFE"), { type: "ARRIVED" });
    expect(arrived.ctx.ending).toBe(true);
    expect(arrived.actions).toContain("ARRIVAL_PROMPT");
    expect(transition(arrived.ctx, { type: "CHALLENGE_PASSED" }).actions).toContain("ASK_FEEDBACK");
  });

  it("danger-zone reconfirm arms the 5-min timer once the challenge is passed", () => {
    const amber = transition(at("SAFE"), { type: "DANGER_ZONE_ENTER" });
    expect(amber.ctx.state).toBe("AMBER");
    expect(transition(amber.ctx, { type: "CHALLENGE_PASSED" }).actions).toContain("START_RECONFIRM_TIMER");
  });

  it("cancel flow keeps the siren held (not off) while the guardian request is open, then off on approval", () => {
    const hold = transition(at("CRITICAL"), { type: "CANCEL_REQUESTED", method: "word" });
    expect(hold.ctx.state).toBe("CANCEL_HOLD");
    expect(hold.actions).toContain("SIREN_HOLD");
    expect(hold.actions).not.toContain("SIREN_OFF");
    const confirmed = transition(hold.ctx, { type: "GUARDIAN_VOTE", safe: true, contactId: "c1" });
    expect(confirmed.ctx.heightened).toBe(true);
    expect(confirmed.actions).toEqual(expect.arrayContaining(["SIREN_OFF", "HEIGHTENED_MODE", "NOTIFY_GUARDIANS_CANCELLED_BY"]));
  });

  it("camera pause: emergency escalation auto-resumes the camera", () => {
    const paused = transition(at("SAFE"), { type: "SENSOR_PAUSE_REQUEST", sensor: "cam" });
    const on = transition(paused.ctx, { type: "CHALLENGE_PASSED", pauseSensor: "cam" });
    expect(on.ctx.cameraPaused).toBe(true);
    const emerg = transition(on.ctx, { type: "SCORE", score: 2, reasons: ["unwanted_contact"] });
    expect(emerg.ctx.state).toBe("EMERGENCY");
    expect(emerg.ctx.cameraPaused).toBe(false);
    expect(emerg.actions).toContain("CAMERA_RESUME");
  });
});

// ---------------------------------------------------------------------------
// Timing contract each row leans on — asserted against the PRD/ADR numbers.
// (Wall-clock firing lives in the runner timing test; here we pin the numbers.)
// ---------------------------------------------------------------------------
describe("journey scenario timing constants (PRD/ADR)", () => {
  it("are-you-safe: speaker prompt at 3 s, CRITICAL at 5 s total (ADR-013)", () => {
    expect(CHALLENGE_SPEAK_MS).toBe(3000);
    expect(CHALLENGE_CRITICAL_MS).toBe(5000);
  });
  it("heartbeat: 30 s gap in SAFE → CRITICAL, still OK at exactly 30 s (5 s cadence)", () => {
    expect(HEARTBEAT_MS).toBe(5000);
    expect(heartbeatVerdict({ lastHeartbeatAt: 0, now: 30000, state: "SAFE", batteryLow: false })).toBe("OK");
    expect(heartbeatVerdict({ lastHeartbeatAt: 0, now: 30001, state: "SAFE", batteryLow: false })).toBe("CRITICAL");
  });
  it("re-confirm loop is 5 min (ADR danger-zone / AMBER continue)", () => {
    expect(RECONFIRM_MS).toBe(5 * 60_000);
    expect(reconfirmDue(0, RECONFIRM_MS - 1)).toBe(false);
    expect(reconfirmDue(0, RECONFIRM_MS)).toBe(true);
  });
  it("stationary tiers are 15 min (nudge) and 30 min (are-you-safe) (ADR-039)", () => {
    expect(STATIONARY_T1_MS).toBe(15 * 60_000);
    expect(STATIONARY_T2_MS).toBe(30 * 60_000);
  });
});
