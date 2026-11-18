import { liveAllowed, guardianView } from "@/lib/liveGate";
test("frames and live only in EMERGENCY / CRITICAL / CANCEL_HOLD (ADR-039 §3)", () => {
  for (const s of ["EMERGENCY", "CRITICAL", "CANCEL_HOLD"]) expect(liveAllowed(s)).toBe(true);
  for (const s of ["IDLE", "ARMED", "SAFE", "AMBER", "AMBER_HOLD", "LATE_CHECK", "RESOLVED_MONITORING", "RESOLVED", null, "garbage"]) expect(liveAllowed(s)).toBe(false);
});
test("guardian view payload", () => {
  expect(guardianView("SAFE")).toEqual({ showFrames: false, showLive: false, note: "Location and status only until an alarm." });
  expect(guardianView("CRITICAL")).toEqual({ showFrames: true, showLive: true, note: null });
});
test("R47c: an expired/done journey is never live even if its last state is CRITICAL", () => {
  expect(liveAllowed("CRITICAL", "expired")).toBe(false);
  expect(liveAllowed("CRITICAL", "done")).toBe(false);
  expect(liveAllowed("CRITICAL", "monitoring")).toBe(true);
  expect(guardianView("CRITICAL", "expired")).toEqual({ showFrames: false, showLive: false, note: "Archived, no live feed." });
});
