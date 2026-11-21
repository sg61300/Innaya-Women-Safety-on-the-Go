import { applyEvent, type ApplyEventDeps } from "@/lib/journeyState";

let openRequest: { id: string } | null = null;
function deps(row: Record<string, unknown>, state = "SAFE") {
  const updates: unknown[] = [], inserts: unknown[] = [];
  const db: any = { from: (t: string) => ({
    select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: t === "cancel_requests" ? openRequest : null }) }) }), single: async () => ({ data: row }), order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { state } }) }) }) }) }),
    insert: async (v: unknown) => { inserts.push([t, v]); return { data: null }; },
    update: (v: unknown) => ({ eq: () => { updates.push([t, v]); const p: any = Promise.resolve({ data: null }); p.is = () => p; return p; } }),
  }) };
  const d: ApplyEventDeps = { db, logEvent: jest.fn(async () => {}), notifyGuardians: jest.fn(async () => {}), notifyNearby: jest.fn(async () => []) };
  return { d, updates, inserts };
}
test("camera pause persists camera_paused_at + heightened and notifies guardians with the pause copy", async () => {
  const { d, updates } = deps({ ending: false, heightened: false, camera_paused_at: null, challenge_kind: "pause" });
  const r = await applyEvent("j1", { type: "CHALLENGE_PASSED", pauseSensor: "cam" }, "user", d);
  expect(r.state).toBe("SAFE"); expect(r.actions).toContain("CAMERA_PAUSE");
  expect(updates).toEqual([["journeys", expect.objectContaining({ heightened: true, camera_paused_at: expect.any(String), challenge_kind: null })]]);
  expect(d.notifyGuardians).toHaveBeenCalledWith("j1", "SAFE", "Camera paused by her (verified)", expect.stringContaining("still listening"));
});
test("pause request persists challenge_kind so a CHALLENGE_TIMEOUT from a restarted app still escalates", async () => {
  const { d, updates } = deps({ ending: false, heightened: false, camera_paused_at: null, challenge_kind: null });
  await applyEvent("j1", { type: "SENSOR_PAUSE_REQUEST", sensor: "cam" }, "user", d);
  expect(updates).toEqual([["journeys", expect.objectContaining({ challenge_kind: "pause" })]]);
  const { d: d2 } = deps({ ending: false, heightened: false, camera_paused_at: null, challenge_kind: "pause" });
  expect((await applyEvent("j1", { type: "CHALLENGE_TIMEOUT" }, "user", d2)).state).toBe("CRITICAL");
});
// ADR-043: the cancel-request and cancelled-by guardian messages are sent by the
// /api/cancel-request routes (they need the asked guardians, signed link, request
// id, canceller name), so these two transitions fan out NOTHING from journeyState.
test("G2: CANCEL_REQUESTED stays CRITICAL on the server and sends no guardian or nearby message from journeyState", async () => {
  const { d } = deps({ ending: false, heightened: false, camera_paused_at: null, challenge_kind: null }, "CRITICAL");
  const r = await applyEvent("j1", { type: "CANCEL_REQUESTED", method: "word" }, "user", d);
  expect(r.state).toBe("CRITICAL");
  expect(d.notifyGuardians).not.toHaveBeenCalled();
  expect(d.notifyNearby).not.toHaveBeenCalled();
});
test("CANCEL_HOLD → RESOLVED_MONITORING (first Safe vote) sends no guardian message from journeyState and writes heightened", async () => {
  const { d, updates } = deps({ ending: false, heightened: false, camera_paused_at: null, challenge_kind: null }, "CANCEL_HOLD");
  const r = await applyEvent("j1", { type: "GUARDIAN_VOTE", safe: true, contactId: "c1" }, "trustee", d);
  expect(r.state).toBe("RESOLVED_MONITORING");
  expect(d.notifyGuardians).not.toHaveBeenCalled();
  expect(updates.some(([t, v]: any) => t === "journeys" && v.heightened === true)).toBe(true);
});
test("silent SOS persists alarm_mode='silent' and never emits SIREN_ON", async () => {
  const { d, inserts, updates } = deps({ ending: false, heightened: false, camera_paused_at: null, challenge_kind: null, alarm_mode: "siren" }, "SAFE");
  const r = await applyEvent("j1", { type: "SOS", mode: "silent" }, "user", d);
  expect(r.state).toBe("CRITICAL");
  expect(r.actions).not.toContain("SIREN_ON");
  expect(updates.some(([t, v]: any) => t === "journeys" && v.alarm_mode === "silent")).toBe(true);
  expect(inserts.some(([t, v]: any) => t === "journey_state" && v.state === "CRITICAL")).toBe(true);
});
test("stationary tier 1 / cap / route copy reaches guardians", async () => {
  const { d } = deps({ ending: false, heightened: false, camera_paused_at: null, challenge_kind: null });
  await applyEvent("j1", { type: "STATIONARY", tier: 1 }, "device", d);
  expect(d.notifyGuardians).toHaveBeenLastCalledWith("j1", "SAFE", "She has stopped", expect.stringContaining("15 min"));
  await applyEvent("j1", { type: "ROUTE_DEVIATION", kind: "away" }, "device", d);
  expect(d.notifyGuardians).toHaveBeenLastCalledWith("j1", "SAFE", "Route check", expect.stringContaining("away from her destination"));
  await applyEvent("j1", { type: "MONITOR_CAP" }, "device", d);
  expect(d.notifyGuardians).toHaveBeenLastCalledWith("j1", "SAFE", "Journey ended automatically", expect.stringContaining("no alarm"));
});

// Fix AD round 2: "waiting" is an open request row on a CRITICAL alarm.
describe("with an open cancel request", () => {
  beforeEach(() => { openRequest = { id: "r1" }; });
  afterEach(() => { openRequest = null; });
  const flags = { ending: false, heightened: false, camera_paused_at: null, challenge_kind: null };
  test("a guardian Safe on CRITICAL ends the alarm", async () => {
    const { d } = deps(flags, "CRITICAL");
    expect((await applyEvent("j1", { type: "GUARDIAN_VOTE", safe: true, contactId: "c1" }, "trustee", d)).state).toBe("RESOLVED_MONITORING");
  });
  test("G2: a repeat CANCEL_REQUESTED adds no state row and no fan-out", async () => {
    const { d, inserts } = deps(flags, "CRITICAL");
    await applyEvent("j1", { type: "CANCEL_REQUESTED", method: "word" }, "user", d);
    expect(inserts).toEqual([]);
    expect(d.notifyGuardians).not.toHaveBeenCalled();
  });
  test("her own SOS closes the request as keep", async () => {
    const { d, updates } = deps(flags, "CRITICAL");
    await applyEvent("j1", { type: "SOS", mode: "siren" }, "user", d);
    expect(updates.some(([t, v]: any) => t === "cancel_requests" && v.verdict === "keep")).toBe(true);
  });
});
test("a guardian Safe on CRITICAL with no open request moves nothing", async () => {
  const { d } = deps({ ending: false, heightened: false, camera_paused_at: null, challenge_kind: null }, "CRITICAL");
  expect((await applyEvent("j1", { type: "GUARDIAN_VOTE", safe: true, contactId: "c1" }, "trustee", d)).state).toBe("CRITICAL");
});
