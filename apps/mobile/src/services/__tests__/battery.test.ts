// ADR-042 / R47d: the pure battery→UI machine. Native + IO deps of location.ts
// are mocked so we can import the pure helper without side effects.
jest.mock("expo-location", () => ({ Accuracy: { High: 1 }, startLocationUpdatesAsync: jest.fn(), stopLocationUpdatesAsync: jest.fn(), hasStartedLocationUpdatesAsync: jest.fn() }));
jest.mock("expo-task-manager", () => ({ defineTask: jest.fn() }));
jest.mock("expo-battery", () => ({ getBatteryLevelAsync: jest.fn(), getBatteryStateAsync: jest.fn(), BatteryState: { CHARGING: 2, FULL: 3, UNPLUGGED: 1 } }));
jest.mock("expo-keep-awake", () => ({ activateKeepAwakeAsync: jest.fn(), deactivateKeepAwake: jest.fn() }));
jest.mock("../../lib/supabase", () => ({ supabase: { from: () => ({ insert: jest.fn(), update: () => ({ eq: jest.fn() }) }) } }));
jest.mock("../../lib/events", () => ({ events: { log: jest.fn() } }));
jest.mock("../feeds", () => ({ feeds: { onFix: jest.fn(), attach: jest.fn(), detach: jest.fn() } }));
jest.mock("../protocolRunner", () => ({ runner: { tick: jest.fn(), onKeyword: jest.fn() } }));
jest.mock("../audio", () => ({ audio: { start: jest.fn(() => ({ catch: jest.fn() })), stop: jest.fn() } }));

import { batteryStep, BATTERY_UI0, buildHeartbeat } from "../location";

test("21→20→19→10→9→charging→31 fires exactly one prompt per downward crossing", () => {
  let ui = BATTERY_UI0;
  const prompts: (number | null)[] = [];
  const lites: boolean[] = [];
  for (const [pct, chg] of [[21, false], [20, false], [19, false], [10, false], [9, false], [9, true], [31, false]] as [number, boolean][]) {
    const r = batteryStep(ui, pct, chg);
    ui = r.ui;
    prompts.push(r.prompt);
    lites.push(r.ui.lite);
  }
  expect(prompts).toEqual([null, 20, null, 10, null, null, null]);
  expect(lites).toEqual([false, true, true, true, true, false, false]); // lite on ≤20 off-charger, off when charging / >30
});

test("charging clears the latch so a later discharge can prompt again", () => {
  let { ui } = batteryStep(BATTERY_UI0, 20, false); // prompt 20
  ({ ui } = batteryStep(ui, 50, true)); // charge up
  const r = batteryStep(ui, 20, false); // discharge back to 20
  expect(r.prompt).toBe(20); // re-armed
});

test("lite mode is never entered while charging, even at low battery", () => {
  const r = batteryStep(BATTERY_UI0, 8, true);
  expect(r.ui.lite).toBe(false);
  expect(r.prompt).toBeNull();
});

test("R47d hard rule: buildHeartbeat is battery/lite-agnostic — heartbeat cadence untouched", () => {
  // The heartbeat payload does not depend on lite mode; the location task sends it
  // every tick regardless (lite only decimates the separate `locations` write).
  expect(buildHeartbeat("j1", 0.05, { mic: true, cam: true, gps: true, ble: false })).toMatchObject({ battery: 0.05, battery_low: true });
});
