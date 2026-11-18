// Lane J (Senior QA + Senior Dev, s20) — runner WALL-CLOCK timing for the
// scenario table. The reducer sequences are proven in packages/core
// (protocol.scenarios.test.ts); here we prove the runner actually FIRES the
// PRD/ADR timers: the 5 s are-you-safe deadline → CRITICAL, the 3 s speaker
// prompt, the 5-min re-confirm loop, and the 5-min arrival prompt. The 15-min
// camera-pause nudge is already proven in protocolRunner.guards.test.ts and is
// not duplicated here.
jest.useFakeTimers();
const mockPost = jest.fn();
jest.mock("../../lib/api", () => ({ post: (...a: unknown[]) => mockPost(...a) }));
jest.mock("../frameLoop", () => ({ frameLoop: { pause: jest.fn(), resume: jest.fn() } }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 1 } }));
jest.mock("../../lib/events", () => ({ events: { log: jest.fn().mockResolvedValue(undefined), flush: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("../location", () => ({ location: { start: jest.fn(), stop: jest.fn() } }));
jest.mock("../camera", () => ({ camera: { start: jest.fn(), stop: jest.fn(), attach: jest.fn(), setPaused: jest.fn() } }));
const mockSpeak = jest.fn();
jest.mock("../siren", () => ({ siren: { speak: (...a: unknown[]) => mockSpeak(...a), start: jest.fn(), stop: jest.fn(), hold: jest.fn() } }));
jest.mock("../secureWords", () => ({ secureWords: { get: async () => [] } }));
jest.mock("../feeds", () => ({ feeds: { attach: jest.fn(), detach: jest.fn() } }));
jest.mock("../cancelFlow", () => ({ cancelFlow: { start: jest.fn(), startAmberHold: jest.fn(), dispose: jest.fn() } }));

import { createRunner } from "../protocolRunner";
import { useJourney } from "../../store/journey";

const SAFE = { state: "SAFE", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } as const;
const state = () => useJourney.getState().ctx.state;
// Server never overrides local here: reply with a low state so the rank gate keeps local authority.
const quietServer = () => mockPost.mockResolvedValue({ state: "SAFE", actions: [] });

beforeEach(() => {
  jest.clearAllMocks();
  useJourney.getState().set({ journey: { id: "j1" }, ctx: { ...SAFE }, challenge: null });
  quietServer();
});

test("are-you-safe unanswered → speaker prompt at 3 s, CRITICAL at 5 s total; NOT before 5 s", async () => {
  const r = createRunner({ journeyId: "j1" });
  await r.send({ type: "SCORE", score: 1, reasons: ["isolated_location"] }); // SAFE → AMBER opens the check challenge
  expect(state()).toBe("AMBER");
  expect(useJourney.getState().challenge?.kind).toBe("check");

  await jest.advanceTimersByTimeAsync(3000); // 3 s: siren speaks the are-you-safe prompt
  expect(mockSpeak).toHaveBeenCalledTimes(1);

  await jest.advanceTimersByTimeAsync(1999); // 4.999 s: still waiting, no escalation yet
  expect(state()).toBe("AMBER");

  await jest.advanceTimersByTimeAsync(1); // 5.000 s total → CHALLENGE_TIMEOUT → CRITICAL
  expect(state()).toBe("CRITICAL");
});

test("answering the are-you-safe within 5 s → stays AMBER and arms the 5-min re-confirm; a missed re-confirm → CRITICAL", async () => {
  const r = createRunner({ journeyId: "j1" });
  await r.send({ type: "SCORE", score: 1, reasons: ["isolated_location"] });
  expect(state()).toBe("AMBER");

  await r.resolveChallenge("__ui_safe__"); // CHALLENGE_PASSED → stays AMBER, START_RECONFIRM_TIMER (5 min)
  expect(state()).toBe("AMBER");
  expect(useJourney.getState().challenge).toBeNull();

  await jest.advanceTimersByTimeAsync(5 * 60_000 - 1); // just under 5 min
  expect(state()).toBe("AMBER");
  await jest.advanceTimersByTimeAsync(1); // 5 min → RECONFIRM_MISSED → CRITICAL
  expect(state()).toBe("CRITICAL");
});

test("arrival prompt unanswered 5 min → are-you-safe challenge, then 5 s later → CRITICAL", async () => {
  const r = createRunner({ journeyId: "j1" });
  await r.send({ type: "ARRIVED" }); // SAFE(ending) → ARRIVAL_PROMPT (5 min)
  expect(useJourney.getState().challenge?.kind).toBe("arrival");
  expect(state()).toBe("SAFE");

  await jest.advanceTimersByTimeAsync(5 * 60_000); // 5 min → ARRIVAL_PROMPT_TIMEOUT → START_CHALLENGE (are-you-safe)
  expect(useJourney.getState().challenge?.kind).toBe("check");
  expect(state()).toBe("SAFE");

  await jest.advanceTimersByTimeAsync(5000); // are-you-safe unanswered 5 s → CRITICAL
  expect(state()).toBe("CRITICAL");
});
