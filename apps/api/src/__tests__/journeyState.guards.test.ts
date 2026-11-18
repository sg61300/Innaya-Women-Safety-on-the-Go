import { applyEvent, type ApplyEventDeps } from "@/lib/journeyState";

function deps(row: Record<string, unknown>, state = "SAFE") {
  const updates: unknown[] = [], inserts: unknown[] = [];
  const db: any = { from: (t: string) => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: row }), order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { state } }) }) }) }) }),
    insert: async (v: unknown) => { inserts.push([t, v]); return { data: null }; },
    update: (v: unknown) => ({ eq: async () => { updates.push([t, v]); return { data: null }; } }),
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
test("CRITICAL → CANCEL_HOLD (CANCEL_REQUESTED) sends no guardian message from journeyState", async () => {
  const { d } = deps({ ending: false, heightened: false, camera_paused_at: null, challenge_kind: null }, "CRITICAL");
  const r = await applyEvent("j1", { type: "CANCEL_REQUESTED", method: "word" }, "user", d);
  expect(r.state).toBe("CANCEL_HOLD");
  expect(d.notifyGuardians).not.toHaveBeenCalled();
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
