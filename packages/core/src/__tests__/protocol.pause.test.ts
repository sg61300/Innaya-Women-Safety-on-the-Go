import { transition, initialContext } from "../protocol";
import type { ProtocolContext, ProtocolEvent } from "../types";
const at = (state: ProtocolContext["state"], extra: Partial<ProtocolContext> = {}): ProtocolContext => ({ ...initialContext(), state, ...extra });
const go = (c: ProtocolContext, e: ProtocolEvent) => transition(c, e);

describe("ADR-038 camera pause", () => {
  it("pause request in SAFE opens a typed-only pause challenge, state unchanged", () => {
    const r = go(at("SAFE"), { type: "SENSOR_PAUSE_REQUEST", sensor: "cam" });
    expect(r.ctx).toEqual(at("SAFE", { challenge: "pause" }));
    expect(r.actions).toEqual(["START_CHALLENGE_PAUSE"]);
  });
  it("pause request also works in AMBER and RESOLVED_MONITORING", () => {
    for (const s of ["AMBER", "RESOLVED_MONITORING"] as const) expect(go(at(s), { type: "SENSOR_PAUSE_REQUEST", sensor: "cam" }).actions).toContain("START_CHALLENGE_PAUSE");
  });
  it("correct word → camera paused, heightened, guardians told, state unchanged", () => {
    const r = go(at("SAFE", { challenge: "pause" }), { type: "CHALLENGE_PASSED", pauseSensor: "cam" });
    expect(r.ctx).toEqual(at("SAFE", { cameraPaused: true, heightened: true }));
    expect(r.actions).toEqual(["CAMERA_PAUSE", "HEIGHTENED_MODE", "NOTIFY_GUARDIANS_CAMERA_PAUSED"]);
  });
  it("pause challenge timeout → CRITICAL", () => {
    const r = go(at("SAFE", { challenge: "pause" }), { type: "CHALLENGE_TIMEOUT" });
    expect(r.ctx.state).toBe("CRITICAL"); expect(r.actions).toContain("SIREN_ON");
  });
  it("cam SENSOR_LOST while paused is ignored; other sensors still escalate", () => {
    const paused = at("SAFE", { cameraPaused: true, heightened: true });
    expect(go(paused, { type: "SENSOR_LOST", sensor: "cam", batteryLow: false })).toEqual({ ctx: paused, actions: [], reason: "camera paused" });
    expect(go(paused, { type: "SENSOR_LOST", sensor: "mic", batteryLow: false }).ctx.state).toBe("CRITICAL");
  });
  it("resume is a single event, no word", () => {
    const r = go(at("SAFE", { cameraPaused: true, heightened: true }), { type: "SENSOR_RESUME", sensor: "cam" });
    expect(r.ctx).toEqual(at("SAFE", { cameraPaused: false, heightened: true }));
    expect(r.actions).toEqual(["CAMERA_RESUME", "NOTIFY_GUARDIANS_CAMERA_RESUMED"]);
  });
  it("auto-resumes on EMERGENCY and CRITICAL from any trigger", () => {
    const paused = at("SAFE", { cameraPaused: true, heightened: true });
    const e = go(paused, { type: "SCORE", score: 2, reasons: ["unwanted_contact"] });
    expect(e.ctx.state).toBe("EMERGENCY"); expect(e.ctx.cameraPaused).toBe(false); expect(e.actions).toContain("CAMERA_RESUME");
    const c = go(paused, { type: "KEYWORD", kind: "emergency" });
    expect(c.ctx.state).toBe("CRITICAL"); expect(c.ctx.cameraPaused).toBe(false); expect(c.actions).toContain("CAMERA_RESUME");
  });
  it("score 1 while paused escalates to EMERGENCY because heightened (existing rule, unchanged)", () => {
    expect(go(at("SAFE", { cameraPaused: true, heightened: true }), { type: "SCORE", score: 1, reasons: ["threatening_speech"] }).ctx.state).toBe("EMERGENCY");
  });
  it("pause is carried through non-alarm transitions (SAFE → AMBER on danger zone keeps cameraPaused)", () => {
    expect(go(at("SAFE", { cameraPaused: true, heightened: true }), { type: "DANGER_ZONE_ENTER" }).ctx.cameraPaused).toBe(true);
  });
});
