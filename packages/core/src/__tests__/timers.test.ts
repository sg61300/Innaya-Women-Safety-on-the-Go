import { challengeDeadlines, heartbeatVerdict, reconfirmDue, lateDue, arrivalDue } from "../timers";
test("challenge deadlines 3 s / 5 s", () => expect(challengeDeadlines(1000)).toEqual({ speakAt: 4000, criticalAt: 6000 }));
test("heartbeat gap thresholds 30 s SAFE/AMBER, 15 s EMERGENCY; battery-low → AMBER", () => {
  expect(heartbeatVerdict({ lastHeartbeatAt: 0, now: 29000, state: "SAFE", batteryLow: false })).toBe("OK");
  expect(heartbeatVerdict({ lastHeartbeatAt: 0, now: 30001, state: "SAFE", batteryLow: false })).toBe("CRITICAL");
  expect(heartbeatVerdict({ lastHeartbeatAt: 0, now: 30001, state: "AMBER", batteryLow: false })).toBe("CRITICAL");
  expect(heartbeatVerdict({ lastHeartbeatAt: 0, now: 15001, state: "EMERGENCY", batteryLow: false })).toBe("CRITICAL");
  expect(heartbeatVerdict({ lastHeartbeatAt: 0, now: 14000, state: "EMERGENCY", batteryLow: false })).toBe("OK");
  expect(heartbeatVerdict({ lastHeartbeatAt: 0, now: 60000, state: "SAFE", batteryLow: true })).toBe("AMBER");
  expect(heartbeatVerdict({ lastHeartbeatAt: 0, now: 60000, state: "CRITICAL", batteryLow: false })).toBe("OK");
});
test("heartbeat at exactly the 30 s limit is OK", () => {
  expect(heartbeatVerdict({ lastHeartbeatAt: 0, now: 30000, state: "SAFE", batteryLow: false })).toBe("OK");
});
test("reconfirm due after 5 min", () => { expect(reconfirmDue(0, 299999)).toBe(false); expect(reconfirmDue(0, 300000)).toBe(true); });
test("late at 1×expected duration (Q3) and 150 m arrival", () => {
  expect(lateDue(0, 600, 599_999)).toBe(false); expect(lateDue(0, 600, 600_000)).toBe(true);
  expect(arrivalDue(151)).toBe(false); expect(arrivalDue(150)).toBe(true);
});

import { capFor, stationaryRadiusM, STATIONARY_T1_MS, STATIONARY_T2_MS, STATIONARY_MAX_DEFER_MS, ROUTE_REROUTE_MS, ROUTE_OFF_M, ROUTE_ETA_FACTOR } from "../timers";
test("ADR-039 cap = min(3 × ETA + 30 min, 8 h)", () => {
  expect(capFor(2700)).toBe(3 * 2700 * 1000 + 30 * 60_000);      // 45 min ETA → 2 h 45 min
  expect(capFor(4 * 3600)).toBe(8 * 3600 * 1000);                  // 4 h ETA → capped at 8 h
  expect(capFor(0)).toBe(30 * 60_000);
});
test("ADR-039 stationary radius = clamp(2 × accuracy, 60, 120)", () => {
  expect(stationaryRadiusM(10)).toBe(60); expect(stationaryRadiusM(40)).toBe(80); expect(stationaryRadiusM(90)).toBe(120);
});
test("ADR-039/040 constants", () => {
  expect(STATIONARY_T1_MS).toBe(15 * 60_000); expect(STATIONARY_T2_MS).toBe(30 * 60_000); expect(STATIONARY_MAX_DEFER_MS).toBe(60 * 60_000);
  expect(ROUTE_REROUTE_MS).toBe(120_000); expect(ROUTE_OFF_M).toBe(300); expect(ROUTE_ETA_FACTOR).toBe(1.3);
});
import { SOS_MODE_CHOICE_MS, SOS_SIREN_DELAY_MS, CANCEL_PASSWORD_LOCK_MS } from "../timers";
test("ADR-043 cancel/SOS-mode timers", () => {
  expect(SOS_MODE_CHOICE_MS).toBe(10_000); expect(SOS_SIREN_DELAY_MS).toBe(10_000);
  expect(CANCEL_PASSWORD_LOCK_MS).toBe(30_000);
});
