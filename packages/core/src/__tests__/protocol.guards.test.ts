import { transition, initialContext } from "../protocol";
import type { ProtocolContext, ProtocolEvent } from "../types";
const at = (state: ProtocolContext["state"], extra: Partial<ProtocolContext> = {}): ProtocolContext => ({ ...initialContext(), state, ...extra });
const go = (c: ProtocolContext, e: ProtocolEvent) => transition(c, e);

describe("ADR-039 stationary", () => {
  it("tier 1 in SAFE only tells guardians, no challenge, no state change", () => {
    expect(go(at("SAFE"), { type: "STATIONARY", tier: 1 })).toEqual({ ctx: at("SAFE"), actions: ["NOTIFY_GUARDIANS_STOPPED"], reason: "stopped 15 min" });
  });
  it("tier 2 in SAFE / RESOLVED_MONITORING opens a stationary challenge", () => {
    for (const s of ["SAFE", "RESOLVED_MONITORING"] as const) {
      const r = go(at(s), { type: "STATIONARY", tier: 2 });
      expect(r.ctx).toEqual(at(s, { challenge: "stationary" })); expect(r.actions).toEqual(["START_CHALLENGE_STATIONARY", "NOTIFY_GUARDIANS_STOPPED"]);
    }
  });
  it("tier 2 in AMBER adds no second challenge", () => {
    const r = go(at("AMBER"), { type: "STATIONARY", tier: 2 });
    expect(r.ctx.state).toBe("AMBER"); expect(r.actions).toEqual(["NOTIFY_GUARDIANS_STOPPED"]);
  });
  it("in EMERGENCY / CRITICAL stationary events are log-only", () => {
    for (const s of ["EMERGENCY", "CRITICAL"] as const) expect(go(at(s), { type: "STATIONARY", tier: 2 }).actions).toEqual([]);
  });
  it("stationary challenge: pass → continue; timeout → CRITICAL", () => {
    const open = at("SAFE", { challenge: "stationary" });
    expect(go(open, { type: "CHALLENGE_PASSED" })).toEqual({ ctx: at("SAFE"), actions: [], reason: "stationary challenge passed" });
    expect(go(open, { type: "CHALLENGE_TIMEOUT" }).ctx.state).toBe("CRITICAL");
  });
});
describe("ADR-039 monitoring cap", () => {
  it("cap in SAFE/AMBER/RESOLVED_MONITORING ends via the arrival prompt and tells guardians", () => {
    for (const s of ["SAFE", "AMBER", "RESOLVED_MONITORING"] as const) {
      const r = go(at(s), { type: "MONITOR_CAP" });
      expect(r.ctx.ending).toBe(true); expect(r.actions).toEqual(["ARRIVAL_PROMPT", "NOTIFY_GUARDIANS_CAP"]);
    }
  });
  it("cap never touches an alarm or a late check", () => {
    for (const s of ["EMERGENCY", "CRITICAL", "CANCEL_HOLD", "LATE_CHECK"] as const) expect(go(at(s), { type: "MONITOR_CAP" })).toEqual({ ctx: at(s), actions: [], reason: expect.any(String) });
  });
  it("after the cap prompt, safe word → RESOLVED and no answer → challenge → CRITICAL (existing end flow)", () => {
    const r = go(at("SAFE"), { type: "MONITOR_CAP" });
    expect(go(r.ctx, { type: "CHALLENGE_PASSED" }).ctx.state).toBe("RESOLVED");
    expect(go(r.ctx, { type: "ARRIVAL_PROMPT_TIMEOUT" }).actions).toContain("START_CHALLENGE");
    expect(go(r.ctx, { type: "CHALLENGE_TIMEOUT" }).ctx.state).toBe("CRITICAL");
  });
});
describe("ADR-040 route deviation", () => {
  it("detour in SAFE opens a route challenge and tells guardians", () => {
    const r = go(at("SAFE"), { type: "ROUTE_DEVIATION", kind: "detour" });
    expect(r.ctx).toEqual(at("SAFE", { challenge: "route" })); expect(r.actions).toEqual(["START_CHALLENGE_ROUTE", "NOTIFY_GUARDIANS_ROUTE"]);
  });
  it("away in SAFE opens an away challenge", () => {
    const r = go(at("SAFE"), { type: "ROUTE_DEVIATION", kind: "away" });
    expect(r.ctx.challenge).toBe("away"); expect(r.actions).toEqual(["START_CHALLENGE_AWAY", "NOTIFY_GUARDIANS_ROUTE"]);
  });
  it("away passed → heightened + guardians told; route passed → plain continue", () => {
    const a = go(at("SAFE", { challenge: "away" }), { type: "CHALLENGE_PASSED" });
    expect(a.ctx).toEqual(at("SAFE", { heightened: true })); expect(a.actions).toEqual(["HEIGHTENED_MODE", "NOTIFY_GUARDIANS_ROUTE"]);
    expect(go(at("SAFE", { challenge: "route" }), { type: "CHALLENGE_PASSED" })).toEqual({ ctx: at("SAFE"), actions: [], reason: "route challenge passed" });
  });
  it("route deviation in AMBER only notifies; in alarms log-only; timeout → CRITICAL", () => {
    expect(go(at("AMBER"), { type: "ROUTE_DEVIATION", kind: "detour" }).actions).toEqual(["NOTIFY_GUARDIANS_ROUTE"]);
    expect(go(at("CRITICAL"), { type: "ROUTE_DEVIATION", kind: "away" }).actions).toEqual([]);
    expect(go(at("SAFE", { challenge: "route" }), { type: "CHALLENGE_TIMEOUT" }).ctx.state).toBe("CRITICAL");
  });
  it("a second challenge request while one is open is ignored (no double modal)", () => {
    const open = at("SAFE", { challenge: "route" });
    expect(go(open, { type: "STATIONARY", tier: 2 }).actions).toEqual(["NOTIFY_GUARDIANS_STOPPED"]);
    expect(go(open, { type: "ROUTE_DEVIATION", kind: "away" }).actions).toEqual(["NOTIFY_GUARDIANS_ROUTE"]);
  });
  it("PLAN_CHANGE still goes to AMBER (Change destination button path)", () => expect(go(at("SAFE", { challenge: "away" }), { type: "PLAN_CHANGE" }).ctx.state).toBe("AMBER"));
});
