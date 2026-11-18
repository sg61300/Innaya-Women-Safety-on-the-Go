import { hrRule } from "@vaira/core";
import { SimulatedVitals } from "./vitalsSimulated";
import { useJourney } from "../store/journey";
import { events } from "../lib/events";

// Task 24b: pluggable vitals source. BLE (react-native-ble-plx, HRS 0x180D) and
// Health Connect land behind the same interface; the pendant arrives with
// hardware. Only `simulated` exists today, and only in dev builds. The UI keeps
// unavailable sources disabled so this service cannot be mistaken for a live feed.
export interface VitalsSource {
  name: "ble" | "health_connect" | "simulated" | "pendant";
  start(on: (s: { hr: number; hrv: number | null; ts: number }) => void): Promise<void>;
  stop(): Promise<void>;
}

// Instantaneous elevation test. Core owns the threshold (hrRule: > baseline+35
// bpm sustained >= 20 s, or > 140 bpm). We pass 20 s so hrRule reports per-sample
// elevation; the real 20 s sustain is tracked by `stressedSince` below, matching
// the architecture rule while keeping the threshold defined in one place (core).
const isElevated = (hr: number, baseline: number) => hrRule(hr, baseline, 20) === 1;

let current: VitalsSource | null = null;
let baseline: number | null = null;

export const vitals = {
  async select(name: VitalsSource["name"]) {
    await current?.stop();
    baseline = null;
    // `simulated` is offered only in dev builds; ble / health_connect: T3.2;
    // pendant: hardware. Unknown/unavailable sources leave `current` null.
    current = name === "simulated" && __DEV__ ? new SimulatedVitals() : null;
  },
  async start(send: (e: { type: "SCORE"; score: 1; reasons: ["vitals_stress"] }) => void) {
    if (!current) {
      // No source attached: reflect the sensor as off (A5) rather than leaving a
      // stale `true` from a previous source.
      useJourney.getState().set({ sensors: { ...useJourney.getState().sensors, vitals: false } });
      return;
    }
    let stressedSince: number | null = null;
    // Resting baseline = the minimum of the first 5 samples. Seeding from sample #1
    // (A5) gives a user who is already stressed at journey start a high baseline
    // that never trips; the minimum approximates rest. isElevated is not evaluated
    // until the baseline exists.
    const warmup: number[] = [];
    await current.start((s) => {
      useJourney.getState().set({ vitals: s });
      if (baseline === null) {
        warmup.push(s.hr);
        if (warmup.length < 5) return;
        baseline = Math.min(...warmup);
      }
      if (isElevated(s.hr, baseline)) {
        stressedSince ??= s.ts;
        if (s.ts - stressedSince >= 20_000) {
          void events.log(
            "vitals",
            { hr: s.hr, baseline, source: current!.name },
            useJourney.getState().journey?.id ?? null
          );
          send({ type: "SCORE", score: 1, reasons: ["vitals_stress"] });
          stressedSince = null;
        }
      } else stressedSince = null;
    });
    useJourney.getState().set({ sensors: { ...useJourney.getState().sensors, vitals: true } });
  },
  async stop() {
    await current?.stop();
    useJourney.getState().set({ sensors: { ...useJourney.getState().sensors, vitals: false } });
  },
};
