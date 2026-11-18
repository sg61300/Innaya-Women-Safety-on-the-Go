import { AppState, PermissionsAndroid, Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Battery from "expo-battery";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import i18n from "../i18n";
import { supabase } from "../lib/supabase";
import { events } from "../lib/events";
import { useJourney, type Sensors } from "../store/journey";
import { runner } from "./protocolRunner";
import { feeds } from "./feeds";
import { audio } from "./audio";

// Task 24: journey foreground service + background location + 15 s heartbeat (A11).
// Registered at module load (imported once from app/_layout.tsx). The Android
// service that keeps this alive with the screen off / app backgrounded / task
// swiped is declared stopWithTask=false, foregroundServiceType="location|
// microphone" by the R35 config plugin (plugins/withForegroundService.js).
export const TASK = "vaira-location";
// Back-compat alias for the stub's exported name (_layout imports for side effect).
export const LOCATION_TASK = TASK;

// battery_low is strict: < 10 % is low, exactly 10 % is not (matches the
// "under 10 %" spec and the UX battery-declared-silence trigger).
export const buildHeartbeat = (journey_id: string, battery: number | null, sensors: Sensors) => ({
  journey_id,
  battery,
  // null battery (read failed) is never "low": a failed read must not trip the
  // battery-declared-silence path (null < 0.1 would coerce to true in JS).
  battery_low: battery != null && battery < 0.1,
  sensors,
});

// ADR-042/R47d pure battery→UI machine. Lite mode: enter at ≤ 20 % and NOT
// charging, exit at > 30 % or charging. A downward crossing of 20 or 10 (while
// not charging) fires ONE charge prompt; charging or rising back above a
// threshold re-arms that threshold so a later discharge can prompt again.
export type BatteryUi = { lite: boolean; notified20: boolean; notified10: boolean };
export const BATTERY_UI0: BatteryUi = { lite: false, notified20: false, notified10: false };
export function batteryStep(prev: BatteryUi, pct: number, charging: boolean): { ui: BatteryUi; prompt: 20 | 10 | null } {
  let lite = prev.lite;
  if (charging || pct > 30) lite = false;
  else if (pct <= 20) lite = true;
  let notified20 = charging || pct > 20 ? false : prev.notified20;
  let notified10 = charging || pct > 10 ? false : prev.notified10;
  let prompt: 20 | 10 | null = null;
  if (!charging) {
    if (pct <= 10 && !notified10) { prompt = 10; notified10 = true; }
    else if (pct <= 20 && !notified20) { prompt = 20; notified20 = true; }
  }
  return { ui: { lite, notified20, notified10 }, prompt };
}

// Battery machine state + lite-mode location decimation counter live at module
// scope so they persist across the background task's ticks.
let batteryUi: BatteryUi = BATTERY_UI0;
let liteLocTick = 0;
async function isCharging(): Promise<boolean> {
  try {
    const s = await Battery.getBatteryStateAsync();
    return s === Battery.BatteryState.CHARGING || s === Battery.BatteryState.FULL;
  } catch {
    return false; // a failed read must not suppress a real low-battery prompt
  }
}

TaskManager.defineTask(TASK, async ({ data, error }: any) => {
  if (error) {
    console.warn("[location task]", error.message);
    void events.log("location_error", { message: error.message });
    return;
  }
  const j = useJourney.getState().journey;
  if (!j) return;
  const loc = data?.locations?.[0];
  if (!loc) return;
  // R47d: in lite mode write the GPS row on every OTHER tick (location interval
  // ×2). The heartbeat below is written on EVERY tick regardless, so the 30 s
  // dead-man's heartbeat cadence is never touched (hard rule).
  const writeLoc = !useJourney.getState().lite || (liteLocTick++ % 2 === 0);
  // Insert the GPS row first, then read the battery: a rejected battery read must
  // never drop the location fix (A3). A failed read sends battery: null.
  if (writeLoc) {
    const { error: locErr } = await supabase.from("locations").insert({
      journey_id: j.id,
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
      speed: loc.coords.speed,
    });
    if (locErr) console.warn("[location task] locations insert", locErr.message);
  }
  const level = await Battery.getBatteryLevelAsync().catch(() => -1);
  const battery = level < 0 ? null : level;
  const hb = buildHeartbeat(j.id, battery, { ...useJourney.getState().sensors, gps: true });
  // R47d: update the battery %, lite flag and any charge prompt. Lite throttles
  // only calm states — never AMBER/EMERGENCY/CRITICAL (hard rule).
  const st = useJourney.getState().ctx.state;
  const throttleable = st === "SAFE" || st === "RESOLVED_MONITORING";
  if (battery != null) {
    const charging = await isCharging();
    const { ui, prompt } = batteryStep(batteryUi, Math.round(battery * 100), charging);
    batteryUi = ui;
    useJourney.getState().set({
      battery: Math.round(battery * 100),
      lite: ui.lite && throttleable,
      // The charge nudge says "lite mode", so raise it only in throttleable states.
      ...(prompt !== null && throttleable ? { batteryPrompt: { pct: Math.round(battery * 100) } } : {}),
    });
  }
  useJourney.getState().set({ batteryLow: hb.battery_low });
  const { error: hbErr } = await supabase.from("heartbeats").insert(hb);
  if (hbErr) console.warn("[location task] heartbeats insert", hbErr.message);
  if (j.owner_id) {
    const { error: profErr } = await supabase
      .from("profiles")
      .update({
        last_geo: `POINT(${loc.coords.longitude} ${loc.coords.latitude})`,
        last_geo_at: new Date().toISOString(),
      })
      .eq("id", j.owner_id);
    if (profErr) console.warn("[location task] profiles update", profErr.message);
  }
  // Runner is a stub until Task 27 (owns it, must not be extended here); tick is
  // optional so the stub without tick() cannot crash the background task.
  runner.tick?.({ lat: loc.coords.latitude, lng: loc.coords.longitude });
  // ADR-039/040 stationary + route feeds (no-op until feeds.attach() on MONITOR_START).
  void feeds.onFix({ lat: loc.coords.latitude, lng: loc.coords.longitude, accuracyM: loc.coords.accuracy ?? 999, speedMps: loc.coords.speed, at: loc.timestamp ?? Date.now() });
});

export const location = {
  async start() {
    // J1: the service is declared foregroundServiceType="location|microphone"
    // (R35, so the keyword listener keeps the mic in the background). Android 14+
    // verifies RECORD_AUDIO at startForeground() time and throws a native
    // SecurityException that JS safe() cannot catch — the app dies. Gate the start
    // on the runtime mic permission: request it once if we are in the foreground,
    // and if it is still not granted refuse to start (no throw) so the runner keeps
    // working and the UI can explain why. Do NOT drop "microphone" from the type.
    if (Platform.OS === "android") {
      const RA = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
      let granted = await PermissionsAndroid.check(RA);
      if (!granted && AppState.currentState === "active") {
        granted = (await PermissionsAndroid.request(RA)) === PermissionsAndroid.RESULTS.GRANTED;
      }
      if (!granted) {
        const jid = useJourney.getState().journey?.id ?? null;
        void events.log("fg_service", { state: "blocked", reason: "mic_permission" }, jid);
        console.warn("[location] start blocked: RECORD_AUDIO not granted");
        useJourney.getState().set({
          sensors: { ...useJourney.getState().sensors, gps: false },
          blockedReason: "mic_permission",
        });
        return;
      }
    }
    await activateKeepAwakeAsync("journey");
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.High,
      // 15 s cadence (A11): one location + one heartbeat + one profile update per
      // tick. 5 s produced ~17k rows/day/user; the protocol needs only a 30 s
      // heartbeat gap to reach CRITICAL, so 15 s keeps that margin at ~1/3 the rows.
      timeInterval: 15000,
      distanceInterval: 0,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: i18n.t("journey.fgTitle"),
        notificationBody: i18n.t("journey.fgBody"),
        killServiceOnDestroy: false,
      },
    });
    useJourney.getState().set({ sensors: { ...useJourney.getState().sensors, gps: true }, blockedReason: null });
    void events.log("fg_service", { state: "started" }, useJourney.getState().journey?.id ?? null);
    // R35: the keyword listener (Task 25) starts/stops with this service, never
    // with the UI. Attach it without blocking the service on model provisioning;
    // an emergency keyword drives the runner to CRITICAL (Task 27 maps KEYWORD).
    audio
      .start((kind, word) => runner.onKeyword(kind, word))
      .catch((e) => console.warn("[location] listener start failed", (e as Error).message));
  },
  async stop() {
    await audio.stop().catch((e) => console.warn("[location] listener stop failed", (e as Error).message));
    // A throw here (e.g. the task registry not ready) must not leak the wake lock
    // or leave the gps flag on: release both in finally (A4).
    try {
      if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
    } catch (e) {
      console.warn("[location] stop updates failed", (e as Error).message);
    } finally {
      deactivateKeepAwake("journey");
      useJourney.getState().set({ sensors: { ...useJourney.getState().sensors, gps: false } });
    }
    void events.log("fg_service", { state: "stopped" }, useJourney.getState().journey?.id ?? null);
  },
};
