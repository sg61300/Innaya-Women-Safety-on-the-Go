import { create } from "zustand";
import { initialContext, type ProtocolContext, type ChallengeKind } from "@vaira/core";

// `vitals` is optional so heartbeats keep their four-sensor shape; the vitals
// source (Task 24b) sets it once a watch/simulated feed is attached.
export type Sensors = { mic: boolean; cam: boolean; gps: boolean; ble: boolean; vitals?: boolean };

// F14 (b16): spo2 and breathing are optional so the demo-scenario feed can show
// all four tiles; real sources (BLE / Health Connect) may still send only hr/hrv.
export type VitalsSample = { hr: number; hrv: number | null; ts: number; spo2?: number | null; breathing?: number | null };

// An open ARE-YOU-SAFE style prompt (Task 27 / ADR-038-040). "arrival" is the
// journey-end sheet (5 min, no speaker prompt); "expiry" (ADR-042/R47c) is the
// are-you-safe shown when the phone finds its alarm already expired/ended on the
// server; the others are core ChallengeKinds.
export type ChallengeUiKind = ChallengeKind | "arrival" | "expiry";

// ADR-042/R47c: the phone came back to an alarm the server already archived. The
// banner (ExpiryNotice) stays until she confirms; `resolved` flips once verified.
export type Expiry = { at: number; variant: "expired" | "ended"; resolved?: boolean };
export type Challenge = {
  kind: ChallengeUiKind;
  deadline: number;
  reason: string;
  ending: boolean;
  speakerPrompt: boolean; // 3 s spoken prompt (false for pause + arrival)
  typedOnly: boolean; // pause: masked typed input only
  secondary: boolean; // away: "Change destination" → PLAN_CHANGE
};

type J = {
  journey: any | null;
  ctx: ProtocolContext;
  sensors: Sensors;
  challenge: Challenge | null;
  lastScore: number;
  batteryLow: boolean;
  // ADR-042/R47d: latest battery percent (0–100 or null) + whether the phone is in
  // lite mode (throttled sensors on low battery, calm states only).
  battery: number | null;
  lite: boolean;
  // J1: why the foreground journey service refused to start (or null when running).
  // "mic_permission" = RECORD_AUDIO not granted, so the location|microphone FGS
  // could not start on Android 14+; the UI surfaces this so arming is not silent.
  blockedReason: "mic_permission" | null;
  // J2: true while an SOS raised from Home has NOT yet been synced to the server
  // (no journey could be created — offline), so guardians are not yet reached. The
  // emergency overlay reads this to show "Reaching your guardians…" rather than a
  // done tick. Cleared once the emergency journey is created and CRITICAL is synced.
  guardiansPending: boolean;
  // A one-shot low-battery charge prompt raised on a downward 20 %/10 % crossing.
  batteryPrompt: { pct: number } | null;
  expiry: Expiry | null;
  vitals: VitalsSample | null;
  // F2 (b16): real siren audio outcome, set by src/services/siren.ts so the
  // emergency checklist can show "Siren on" as failed when audio never started.
  // "unknown" before any attempt, "playing" once start() succeeds, "error" if any
  // stage (audio mode / player / volume) threw.
  sirenStatus: "unknown" | "playing" | "error";
  // F3 (b16): camera frame-pipeline surface for the emergency overlay. camRunning
  // is true while the frame loop is active; camLastFrameAt is the ms timestamp of
  // the last frame that reached the server (null until the first one uploads).
  camRunning: boolean;
  camLastFrameAt: number | null;
};

export const useJourney = create<J & { set: (p: Partial<J>) => void; reset: () => void }>((set) => ({
  journey: null,
  ctx: initialContext(),
  sensors: { mic: false, cam: false, gps: false, ble: false },
  challenge: null,
  lastScore: 0,
  batteryLow: false,
  battery: null,
  lite: false,
  blockedReason: null,
  guardiansPending: false,
  batteryPrompt: null,
  expiry: null,
  vitals: null,
  sirenStatus: "unknown",
  camRunning: false,
  camLastFrameAt: null,
  set: (p) => set(p),
  reset: () => set({ journey: null, ctx: initialContext(), challenge: null, lastScore: 0, battery: null, lite: false, blockedReason: null, guardiansPending: false, batteryPrompt: null, expiry: null, vitals: null, sirenStatus: "unknown", camRunning: false, camLastFrameAt: null }),
}));
