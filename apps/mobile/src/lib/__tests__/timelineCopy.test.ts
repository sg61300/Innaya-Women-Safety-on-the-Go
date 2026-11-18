process.env.TZ = "Asia/Kolkata";
import { timelineCopy } from "../timelineCopy";

test("guardian timeline copy for the new events", () => {
  expect(timelineCopy({ type: "protocol_event", payload: { ev: { type: "CHALLENGE_PASSED", pauseSensor: "cam" }, actions: ["CAMERA_PAUSE"] } })).toBe("Camera paused by her (verified)");
  expect(timelineCopy({ type: "protocol_event", payload: { ev: { type: "SENSOR_RESUME", sensor: "cam" }, actions: ["CAMERA_RESUME"] } })).toBe("Camera back on");
  expect(timelineCopy({ type: "protocol_event", payload: { ev: { type: "STATIONARY", tier: 1 }, actions: [] }, at: "2026-09-05T09:02:00Z" })).toBe("Stopped since 14:32");
  expect(timelineCopy({ type: "protocol_event", payload: { ev: { type: "STATIONARY", tier: 2 }, actions: ["START_CHALLENGE_STATIONARY"] } })).toBe("Check-in: in one place 30 min");
  expect(timelineCopy({ type: "protocol_event", payload: { ev: { type: "ROUTE_DEVIATION", kind: "detour" }, actions: [] } })).toBe("Route changed — asking her safe word");
  expect(timelineCopy({ type: "protocol_event", payload: { ev: { type: "ROUTE_DEVIATION", kind: "away" }, actions: [] } })).toBe("Moving away from destination — asking her safe word");
  expect(timelineCopy({ type: "protocol_event", payload: { ev: { type: "MONITOR_CAP" }, actions: [] } })).toBe("Journey ended automatically (time limit, no alarm)");
  expect(timelineCopy({ type: "protocol_event", payload: { ev: { type: "SCORE", score: 0 }, actions: [] } })).toBeNull();
});

test("unknown / empty rows return null rather than throwing", () => {
  expect(timelineCopy({ type: "protocol_event", payload: {} })).toBeNull();
  expect(timelineCopy({})).toBeNull();
  // a resume of a non-camera sensor is not a guardian timeline line
  expect(timelineCopy({ type: "protocol_event", payload: { ev: { type: "SENSOR_RESUME", sensor: "mic" }, actions: [] } })).toBeNull();
});
