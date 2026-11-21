import { transition, initialContext, cancelVerdict } from "../protocol";
import type { ProtocolContext, ProtocolEvent } from "../types";
const at = (state: ProtocolContext["state"], ending = false, heightened = false, alarmMode: ProtocolContext["alarmMode"] = "siren"): ProtocolContext => ({ state, ending, heightened, cameraPaused: false, challenge: null, alarmMode });
const go = (c: ProtocolContext, e: ProtocolEvent) => transition(c, e);
const DIRECT: ProtocolEvent[] = [{ type: "KEYWORD", kind: "emergency" }, { type: "KEYWORD", kind: "help" }, { type: "KEYWORD", kind: "sos" }, { type: "SOS" }];

describe("arming", () => {
  it("IDLE --ARM--> ARMED shares location", () => {
    const r = go(initialContext(), { type: "ARM" });
    expect(r.ctx.state).toBe("ARMED"); expect(r.actions).toContain("SHARE_LOCATION");
  });
  it("ARMED --MONITOR_START--> SAFE", () => expect(go(at("ARMED"), { type: "MONITOR_START" }).ctx.state).toBe("SAFE"));
});
describe("from SAFE", () => {
  it("score 1 → AMBER with challenge + guardians + fast frames", () => {
    const r = go(at("SAFE"), { type: "SCORE", score: 1, reasons: ["isolated_location"] });
    expect(r.ctx.state).toBe("AMBER");
    expect(r.actions).toEqual(expect.arrayContaining(["START_CHALLENGE","NOTIFY_GUARDIANS_AMBER","FRAME_FAST"]));
  });
  it("score 2 → EMERGENCY with siren, notify all, live, challenge", () => {
    const r = go(at("SAFE"), { type: "SCORE", score: 2, reasons: ["unwanted_contact"] });
    expect(r.ctx.state).toBe("EMERGENCY");
    expect(r.actions).toEqual(expect.arrayContaining(["SIREN_ON","NOTIFY_ALL_EMERGENCY","START_LIVE","START_CHALLENGE"]));
  });
  it("score 3 → CRITICAL with nearby", () => {
    const r = go(at("SAFE"), { type: "SCORE", score: 3, reasons: ["weapon"] });
    expect(r.ctx.state).toBe("CRITICAL"); expect(r.actions).toContain("NOTIFY_NEARBY"); expect(r.actions).toContain("NOTIFY_ALL_CRITICAL");
  });
  it("score 0 stays SAFE, no actions", () => expect(go(at("SAFE"), { type: "SCORE", score: 0, reasons: ["none"] })).toEqual({ ctx: at("SAFE"), actions: [], reason: "score 0" }));
  it("ADR-013: emergency keyword / help / sos / SOS button → CRITICAL immediately, siren + nearby, no challenge", () => {
    for (const ev of DIRECT) {
      const r = go(at("SAFE"), ev);
      expect(r.ctx.state).toBe("CRITICAL");
      expect(r.actions).toEqual(expect.arrayContaining(["SIREN_ON", "NOTIFY_ALL_CRITICAL", "NOTIFY_NEARBY", "START_LIVE"]));
      expect(r.actions).not.toContain("START_CHALLENGE");
    }
  });
  it("ADR-013 holds from every monitoring state", () => {
    for (const s of ["AMBER", "EMERGENCY", "LATE_CHECK", "RESOLVED_MONITORING"] as const)
      for (const ev of DIRECT) expect(go(at(s), ev).ctx.state).toBe("CRITICAL");
  });
  // H5: SOS / emergency word from the Home screen (no armed journey) must still
  // enter CRITICAL with the siren — ADR-013 is "immediately, regardless of journey".
  it("ADR-013: SOS / emergency word from IDLE and ARMED → CRITICAL + siren (H5)", () => {
    for (const s of ["IDLE", "ARMED"] as const)
      for (const ev of DIRECT) {
        const r = go(at(s), ev);
        expect(r.ctx.state).toBe("CRITICAL");
        expect(r.actions).toContain("SIREN_ON");
      }
  });
  it("sensor lost with low battery → AMBER; without → CRITICAL", () => {
    expect(go(at("SAFE"), { type: "SENSOR_LOST", sensor: "cam", batteryLow: true }).ctx.state).toBe("AMBER");
    expect(go(at("SAFE"), { type: "SENSOR_LOST", sensor: "cam", batteryLow: false }).ctx.state).toBe("CRITICAL");
  });
  it("heartbeat gap → CRITICAL", () => expect(go(at("SAFE"), { type: "HEARTBEAT_GAP" }).ctx.state).toBe("CRITICAL"));
  it("danger zone / guardian concern / plan change → AMBER with challenge", () => {
    for (const ev of [{ type: "DANGER_ZONE_ENTER" }, { type: "GUARDIAN_CONCERN" }, { type: "PLAN_CHANGE" }] as ProtocolEvent[]) {
      const r = go(at("SAFE"), ev); expect(r.ctx.state).toBe("AMBER"); expect(r.actions).toContain("START_CHALLENGE");
    }
  });
  it("journey end (Q3): ARRIVED within expected duration → arrival prompt; safe word resolves", () => {
    const r = go(at("SAFE"), { type: "ARRIVED" });
    expect(r.ctx).toEqual(at("SAFE", true)); expect(r.actions).toContain("ARRIVAL_PROMPT");
    const r2 = go(r.ctx, { type: "CHALLENGE_PASSED" });
    expect(r2.ctx.state).toBe("RESOLVED"); expect(r2.actions).toContain("ASK_FEEDBACK");
  });
  it("arrival prompt unanswered 5 min → challenge; challenge timeout → CRITICAL", () => {
    expect(go(at("SAFE", true), { type: "ARRIVAL_PROMPT_TIMEOUT" }).actions).toContain("START_CHALLENGE");
    expect(go(at("SAFE", true), { type: "CHALLENGE_TIMEOUT" }).ctx.state).toBe("CRITICAL");
  });
  it("late (Q3): expected duration passed, not arrived → LATE_CHECK with guardian call, monitoring continues", () => {
    const r = go(at("SAFE"), { type: "LATE" });
    expect(r.ctx.state).toBe("LATE_CHECK"); expect(r.actions).toEqual(expect.arrayContaining(["CALL_GUARDIAN", "NOTIFY_GUARDIANS_AMBER"]));
    expect(r.actions).not.toContain("SIREN_ON");
  });
  it("LATE_CHECK: guardian confirms → SAFE; guardian says wrong / nobody reachable → CRITICAL", () => {
    expect(go(at("LATE_CHECK"), { type: "GUARDIAN_LATE_CONFIRM", safe: true }).ctx.state).toBe("SAFE");
    expect(go(at("LATE_CHECK"), { type: "GUARDIAN_LATE_CONFIRM", safe: false }).ctx.state).toBe("CRITICAL");
    expect(go(at("LATE_CHECK"), { type: "CALL_FAILED" }).ctx.state).toBe("CRITICAL");
  });
});
describe("from AMBER", () => {
  it("challenge passed stays AMBER and starts 5-min reconfirm", () => {
    const r = go(at("AMBER"), { type: "CHALLENGE_PASSED" });
    expect(r.ctx.state).toBe("AMBER"); expect(r.actions).toContain("START_RECONFIRM_TIMER");
  });
  it("signals safe → SAFE with normal frames, siren off", () => {
    const r = go(at("AMBER"), { type: "SIGNALS_SAFE" });
    expect(r.ctx.state).toBe("SAFE"); expect(r.actions).toEqual(expect.arrayContaining(["FRAME_NORMAL","SIREN_OFF"]));
  });
  it("challenge timeout / reconfirm missed / non-battery sensor loss → CRITICAL", () => {
    expect(go(at("AMBER"), { type: "CHALLENGE_TIMEOUT" }).ctx.state).toBe("CRITICAL");
    expect(go(at("AMBER"), { type: "RECONFIRM_MISSED" }).ctx.state).toBe("CRITICAL");
    expect(go(at("AMBER"), { type: "SENSOR_LOST", sensor: "mic", batteryLow: false }).ctx.state).toBe("CRITICAL");
  });
  it("score 2 → EMERGENCY, score 3 → CRITICAL", () => {
    expect(go(at("AMBER"), { type: "SCORE", score: 2, reasons: [] }).ctx.state).toBe("EMERGENCY");
    expect(go(at("AMBER"), { type: "SCORE", score: 3, reasons: [] }).ctx.state).toBe("CRITICAL");
  });
});
describe("from EMERGENCY", () => {
  it("timeout → CRITICAL", () => expect(go(at("EMERGENCY"), { type: "CHALLENGE_TIMEOUT" }).ctx.state).toBe("CRITICAL"));
  it("passed without guardian confirm stays EMERGENCY; with confirm → AMBER", () => {
    expect(go(at("EMERGENCY"), { type: "CHALLENGE_PASSED" }).ctx.state).toBe("EMERGENCY");
    expect(go(at("EMERGENCY"), { type: "CHALLENGE_PASSED", guardianConfirmed: true }).ctx.state).toBe("AMBER");
  });
  it("score 3 or sensor loss → CRITICAL", () => {
    expect(go(at("EMERGENCY"), { type: "SCORE", score: 3, reasons: [] }).ctx.state).toBe("CRITICAL");
    expect(go(at("EMERGENCY"), { type: "SENSOR_LOST", sensor: "gps", batteryLow: false }).ctx.state).toBe("CRITICAL");
  });
});
describe("from CRITICAL — ADR-043 cancel flow", () => {
  it("steps 1-2 (app password / journey word) verify locally and never move the alarm", () => {
    for (const ev of [{ type: "CANCEL_STEP1_OK" }, { type: "CANCEL_STEP2_OK" }] as ProtocolEvent[]) {
      const r = go(at("CRITICAL"), ev);
      expect(r.ctx.state).toBe("CRITICAL");
      expect(r.actions).toEqual([]);
    }
  });
  it("step 3/4: CANCEL_REQUESTED stays CRITICAL (Fix AD round 2), guardians asked, siren held (siren mode)", () => {
    const r = go(at("CRITICAL"), { type: "CANCEL_REQUESTED", method: "word" });
    expect(r.ctx.state).toBe("CRITICAL");
    expect(r.actions).toEqual(expect.arrayContaining(["NOTIFY_GUARDIANS_CANCEL_REQUEST", "SIREN_HOLD"]));
    expect(r.actions).not.toContain("SIREN_OFF");
  });
  it("silent mode: CANCEL_REQUESTED never holds or sounds the siren", () => {
    const r = go(at("CRITICAL", false, false, "silent"), { type: "CANCEL_REQUESTED", method: "photo" });
    expect(r.ctx.state).toBe("CRITICAL");
    expect(r.actions).toContain("NOTIFY_GUARDIANS_CANCEL_REQUEST");
    expect(r.actions).not.toContain("SIREN_HOLD");
    expect(r.actions).not.toContain("SIREN_ON");
    expect(r.ctx.alarmMode).toBe("silent");
  });
  it("step 7: first Safe vote cancels → heightened RESOLVED_MONITORING, siren off, guardians told", () => {
    const r = go(at("CANCEL_HOLD"), { type: "GUARDIAN_VOTE", safe: true, contactId: "c1" });
    expect(r.ctx).toEqual(at("RESOLVED_MONITORING", false, true));
    expect(r.actions).toEqual(expect.arrayContaining(["SIREN_OFF", "HEIGHTENED_MODE", "NOTIFY_GUARDIANS_CANCELLED_BY"]));
  });
  it("a Not-safe vote leaves the request open (pending)", () => {
    const r = go(at("CANCEL_HOLD"), { type: "GUARDIAN_VOTE", safe: false, contactId: "c1" });
    expect(r.ctx.state).toBe("CANCEL_HOLD");
  });
  it("guardians keep the alarm (GUARDIAN_SAYS_WRONG) → CRITICAL, siren back on (siren mode)", () => {
    const r = go(at("CANCEL_HOLD"), { type: "GUARDIAN_SAYS_WRONG" });
    expect(r.ctx.state).toBe("CRITICAL"); expect(r.actions).toContain("SIREN_ON");
  });
  it("SILENT: entering CRITICAL never emits SIREN_ON; SOS again switches to siren", () => {
    const silent = go(at("SAFE"), { type: "SOS", mode: "silent" });
    expect(silent.ctx.state).toBe("CRITICAL"); expect(silent.ctx.alarmMode).toBe("silent");
    expect(silent.actions).not.toContain("SIREN_ON");
    const again = go(silent.ctx, { type: "SOS", mode: "siren" });
    expect(again.ctx.alarmMode).toBe("siren"); expect(again.actions).toContain("SIREN_ON");
  });
  it("reraise: after a Safe cancel, a re-raise SOS keeps the stored mode → CRITICAL", () => {
    const cancelled = go(at("CANCEL_HOLD", false, false, "silent"), { type: "GUARDIAN_VOTE", safe: true, contactId: "c1" });
    expect(cancelled.ctx.state).toBe("RESOLVED_MONITORING");
    const reraise = go(cancelled.ctx, { type: "SOS", mode: "silent" });
    expect(reraise.ctx.state).toBe("CRITICAL"); expect(reraise.ctx.alarmMode).toBe("silent");
    expect(reraise.actions).not.toContain("SIREN_ON");
  });
  it("RESOLVED_MONITORING (heightened): score 1 → EMERGENCY; guardian raises alarm → EMERGENCY; arrival + safe word → RESOLVED", () => {
    expect(go(at("RESOLVED_MONITORING", false, true), { type: "SCORE", score: 1, reasons: ["isolated_location"] }).ctx.state).toBe("EMERGENCY");
    expect(go(at("RESOLVED_MONITORING", false, true), { type: "GUARDIAN_SAYS_WRONG" }).ctx.state).toBe("EMERGENCY");
    const r = go(at("RESOLVED_MONITORING", false, true), { type: "ARRIVED" });
    expect(go(r.ctx, { type: "CHALLENGE_PASSED" }).ctx.state).toBe("RESOLVED");
  });
  it("nothing else lowers CRITICAL", () => {
    expect(go(at("CRITICAL"), { type: "SCORE", score: 0, reasons: ["none"] }).ctx.state).toBe("CRITICAL");
    expect(go(at("CRITICAL"), { type: "CHALLENGE_PASSED" }).ctx.state).toBe("CRITICAL");
    expect(go(at("CRITICAL"), { type: "CANCEL_STEP1_OK" }).ctx.state).toBe("CRITICAL");
  });
});

describe("ADR-043 cancelVerdict (majority rule)", () => {
  const v = (b: boolean) => ({ safe: b });
  it("first Safe cancels", () => expect(cancelVerdict([v(true)], 3)).toBe("cancel"));
  it("2 of 3 Not-safe keeps", () => expect(cancelVerdict([v(false), v(false)], 3)).toBe("keep"));
  it("Safe then 2 Not-safe → reraise", () => expect(cancelVerdict([v(true), v(false), v(false)], 3)).toBe("reraise"));
  it("1 Not-safe of 3 stays pending", () => expect(cancelVerdict([v(false)], 3)).toBe("pending"));
  it("2 asked, 1 Not-safe stays pending", () => expect(cancelVerdict([v(false)], 2)).toBe("pending"));
  it("Safe stands while only 1 Not-safe (cancel)", () => expect(cancelVerdict([v(true), v(false)], 3)).toBe("cancel"));
  it("no votes → pending", () => expect(cancelVerdict([], 3)).toBe("pending"));
  // Generalised rule: when every asked guardian has voted and none said Safe → keep.
  it("1 asked + 1 Not-safe → keep", () => expect(cancelVerdict([v(false)], 1)).toBe("keep"));
  it("2 asked + 2 Not-safe → keep", () => expect(cancelVerdict([v(false), v(false)], 2)).toBe("keep"));
  it("0 asked → pending", () => expect(cancelVerdict([], 0)).toBe("pending"));
});
describe("END", () => {
  it("END from SAFE/AMBER shows the arrival prompt; from RESOLVED is a no-op", () => {
    expect(go(at("SAFE"), { type: "END" }).ctx).toEqual(at("SAFE", true));
    expect(go(at("RESOLVED"), { type: "END" }).ctx.state).toBe("RESOLVED");
  });
});
describe("re-entering RESOLVED_MONITORING never re-announces a cancel", () => {
  it("heightened AMBER --SIGNALS_SAFE--> RESOLVED_MONITORING without cancel actions or conflicting frame rates", () => {
    const r = go(at("AMBER", false, true), { type: "SIGNALS_SAFE" });
    expect(r.ctx).toEqual(at("RESOLVED_MONITORING", false, true));
    expect(r.actions).not.toContain("NOTIFY_GUARDIANS_CANCELLED_BY"); expect(r.actions).not.toContain("HEIGHTENED_MODE");
    expect(r.actions).not.toContain("FRAME_NORMAL"); expect(r.actions).toEqual(expect.arrayContaining(["SIREN_OFF", "FRAME_FAST"]));
  });
  it("heightened LATE_CHECK --GUARDIAN_LATE_CONFIRM safe--> RESOLVED_MONITORING without cancel actions", () => {
    const r = go(at("LATE_CHECK", false, true), { type: "GUARDIAN_LATE_CONFIRM", safe: true });
    expect(r.ctx.state).toBe("RESOLVED_MONITORING");
    expect(r.actions).not.toContain("NOTIFY_GUARDIANS_CANCELLED_BY"); expect(r.actions).not.toContain("FRAME_NORMAL");
  });
  it("only the guardian-approved cancel edge (CANCEL_HOLD + Safe vote) emits the cancel actions", () => {
    const r = go(at("CANCEL_HOLD"), { type: "GUARDIAN_VOTE", safe: true, contactId: "c1" });
    expect(r.actions).toEqual(expect.arrayContaining(["SIREN_OFF", "HEIGHTENED_MODE", "NOTIFY_GUARDIANS_CANCELLED_BY"]));
  });
});
