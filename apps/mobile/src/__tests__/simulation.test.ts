// Task 32 — simulation drill script + scoring, and the drill() driver over the
// frozen protocol runner (practice mode, no native effects, no server post).
// Mocks mirror protocolRunner.test.ts so the REAL runner is exercised safely.
jest.mock("../services/siren", () => ({ siren: { speak: jest.fn(), start: jest.fn(), stop: jest.fn() } }));
jest.mock("../services/location", () => ({ location: { start: jest.fn(), stop: jest.fn() } }));
jest.mock("../services/camera", () => ({ camera: { start: jest.fn(), stop: jest.fn() } }));
jest.mock("../services/frameLoop", () => ({ frameLoop: { pause: jest.fn(), resume: jest.fn() } }));
jest.mock("../services/feeds", () => ({ feeds: { attach: jest.fn(), detach: jest.fn() } }));
jest.mock("../lib/api", () => ({ post: jest.fn().mockResolvedValue(null) }));
jest.mock("../lib/events", () => ({ events: { log: jest.fn().mockResolvedValue(undefined), flush: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("../services/secureWords", () => ({ secureWords: { get: async () => ["purple kettle"] } }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 1 } }));

import { drillScript, drillScore, simulation } from "../services/simulation";
import { runner } from "../services/protocolRunner";
import { useJourney } from "../store/journey";

// Brief Step 1 (verbatim intent): script timing and the two scoring corners.
test("drill script order and scoring", () => {
  expect(drillScript.map((s) => s.at)).toEqual([0, 1000, 4000, 12000]);
  expect(drillScore({ answeredChallengeMs: 2500, saidEmergencyWord: true })).toBe(100);
  expect(drillScore({ answeredChallengeMs: 6000, saidEmergencyWord: false })).toBe(0);
});

// Stress: threshold boundaries (≤ 5000 counts), each half independent.
test("drillScore boundaries", () => {
  expect(drillScore({ answeredChallengeMs: 5000, saidEmergencyWord: false })).toBe(50);
  expect(drillScore({ answeredChallengeMs: 5001, saidEmergencyWord: true })).toBe(50);
  expect(drillScore({ answeredChallengeMs: 0, saidEmergencyWord: true })).toBe(100);
  expect(drillScore({ answeredChallengeMs: 9999, saidEmergencyWord: false })).toBe(0);
});

// The script sends real events every step (ARM, MONITOR_START, SCORE, KEYWORD).
test("drill script fires the four protocol events in order", () => {
  expect(drillScript.map((s) => s.ev.type)).toEqual(["ARM", "MONITOR_START", "SCORE", "KEYWORD"]);
  const kw = drillScript[3].ev;
  expect(kw.type === "KEYWORD" && kw.kind).toBe("emergency");
});

// F1 (safety, CRITICAL): the runner is the ONE shared instance that also runs a
// real journey. A drill started while a journey is active would silence the real
// journey for 20 s and then stop() it. drill() must refuse: no setPractice, no
// send, nothing touched, when ctx.state is anything but IDLE.
test("drill refuses to touch the runner during a real journey", () => {
  const setP = jest.spyOn(runner, "setPractice");
  const send = jest.spyOn(runner, "send");
  useJourney.getState().set({ ctx: { ...useJourney.getState().ctx, state: "SAFE" } });
  try {
    const steps: number[] = [];
    let done: number | null = null;
    expect(simulation.drill((i) => steps.push(i), (s) => { done = s; })).toBe(false);
    expect(setP).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(steps).toEqual([]);
    expect(done).toBeNull();
  } finally {
    useJourney.getState().set({ ctx: { ...useJourney.getState().ctx, state: "IDLE" } });
    send.mockRestore();
    setP.mockRestore();
  }
});

// drill() drives the frozen runner in practice mode: every step reported once,
// practice toggled on then off, and a score returned. No challenge is answered
// in this scripted path, so the emergency word alone scores 50.
test("drill runs in practice mode and reports steps + score", async () => {
  jest.useFakeTimers();
  const setP = jest.spyOn(runner, "setPractice");
  const send = jest.spyOn(runner, "send");
  const steps: number[] = [];
  let done: number | null = null;

  simulation.drill(
    (i) => steps.push(i),
    (s) => {
      done = s;
    }
  );

  await jest.advanceTimersByTimeAsync(20000);

  expect(steps).toEqual([0, 1, 2, 3]);
  expect(setP).toHaveBeenNthCalledWith(1, true);
  expect(setP).toHaveBeenLastCalledWith(false);
  // Each scripted event reached the runner (the runner may also self-send
  // internally as it escalates — that is its own frozen behaviour).
  const sentTypes = send.mock.calls.map((c) => (c[0] as { type: string }).type);
  for (const s of drillScript) expect(sentTypes).toContain(s.ev.type);
  expect(done).toBe(50); // emergency word said (50) + no challenge answered (0)

  send.mockRestore();
  setP.mockRestore();
  jest.useRealTimers();
});
