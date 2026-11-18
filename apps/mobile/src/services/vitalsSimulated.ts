import type { VitalsSource } from "./vitals";

// F14 (b16): "Demo scenarios" — a realistic per-state vitals profile the vitals
// page can play so the founder sees the tiles move and what the app would infer.
// Ranges are the founder's spec; each sample jitters within the range every tick.
export type DemoScenario = "calm" | "happy" | "elevated" | "panic" | "sleeping";

type Range = [number, number];
type Profile = { hr: Range; spo2: Range; breathing: Range; hrv: Range };

export const DEMO_PROFILES: Record<DemoScenario, Profile> = {
  calm: { hr: [62, 70], spo2: [97, 99], breathing: [12, 14], hrv: [60, 80] },
  happy: { hr: [75, 88], spo2: [97, 99], breathing: [14, 17], hrv: [50, 70] },
  elevated: { hr: [100, 115], spo2: [95, 97], breathing: [18, 22], hrv: [30, 45] },
  panic: { hr: [130, 150], spo2: [93, 96], breathing: [26, 32], hrv: [12, 20] },
  sleeping: { hr: [50, 58], spo2: [96, 98], breathing: [10, 12], hrv: [70, 95] },
};

export const DEMO_SCENARIOS = Object.keys(DEMO_PROFILES) as DemoScenario[];

const inRange = ([lo, hi]: Range) => lo + Math.round(Math.random() * (hi - lo));

// A full vitals sample for the given scenario, each field jittered within range.
export function demoSample(scenario: DemoScenario, ts = Date.now()) {
  const pr = DEMO_PROFILES[scenario];
  return { hr: inRange(pr.hr), spo2: inRange(pr.spo2), breathing: inRange(pr.breathing), hrv: inRange(pr.hrv), ts };
}

// What the app would infer from a heart rate, mirroring the vitals elevation
// bands the protocol uses (elevated ~>=100 bpm, panic ~>=130 bpm). Returns an
// i18n key suffix under "vitals.demoLabel.*".
export function vitalsLabel(hr: number): "calm" | "elevated" | "panic" {
  if (hr >= 130) return "panic";
  if (hr >= 100) return "elevated";
  return "calm";
}

// Task 24b (Q11 / ADR-016): a hardware-free vitals feed so the vitals →
// ARE-YOU-SAFE path is testable without a watch. Scripted trace: 72 bpm baseline
// for 60 s, a spike to 128 bpm for 25 s (60–85 s), then back to baseline. HRV
// drops (55 → 18 ms) while stressed so consumers reading hrv see a stress shape.
export class SimulatedVitals implements VitalsSource {
  name = "simulated" as const;
  private t: ReturnType<typeof setInterval> | null = null;
  private i = 0;
  constructor(private stepMs = 1000) {}
  async start(on: (s: { hr: number; hrv: number | null; ts: number }) => void) {
    this.t = setInterval(() => {
      const sec = this.i++ * (this.stepMs / 1000);
      const hr = sec >= 60 && sec < 85 ? 128 : 72;
      on({ hr, hrv: hr > 100 ? 18 : 55, ts: Date.now() });
    }, this.stepMs);
  }
  async stop() {
    if (this.t) clearInterval(this.t);
    this.t = null;
  }
}
