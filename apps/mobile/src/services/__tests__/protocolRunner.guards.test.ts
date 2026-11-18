// Tasks/07 Task 12 — runner wiring for ADR-038/039/040 (mockPause, stationary, route, away).
jest.useFakeTimers();
const mockPost = jest.fn();
jest.mock("../../lib/api", () => ({ post: (...a: unknown[]) => mockPost(...a) }));
const mockPause = jest.fn(), mockResume = jest.fn();
jest.mock("../frameLoop", () => ({ frameLoop: { pause: () => mockPause(), resume: () => mockResume() } }));
const mockHaptic = jest.fn();
jest.mock("expo-haptics", () => ({ impactAsync: () => mockHaptic(), ImpactFeedbackStyle: { Medium: 1 } }));
// Harness adaptations (services import Supabase / native modules at load):
jest.mock("../../lib/events", () => ({ events: { log: jest.fn().mockResolvedValue(undefined), flush: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("../location", () => ({ location: { start: jest.fn(), stop: jest.fn() } }));
jest.mock("../camera", () => ({ camera: { start: jest.fn(), stop: jest.fn(), attach: jest.fn(), setPaused: jest.fn() } }));
jest.mock("../siren", () => ({ siren: { speak: jest.fn(), start: jest.fn(), stop: jest.fn() } }));
jest.mock("../secureWords", () => ({ secureWords: { get: async () => [] } }));
const mockAttach = jest.fn(), mockDetach = jest.fn();
jest.mock("../feeds", () => ({ feeds: { attach: () => mockAttach(), detach: () => mockDetach() } }));
import { createRunner } from "../protocolRunner";
import { useJourney } from "../../store/journey";

const reply = (state: string, actions: string[]) => mockPost.mockResolvedValueOnce({ state, actions, liveAllowed: false });
beforeEach(() => {
  jest.clearAllMocks();
  useJourney.getState().set({ journey: null, ctx: { state: "IDLE", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const }, challenge: null });
});

test("mockPause flow: request → modal kind mockPause; safe → CHALLENGE_PASSED { pauseSensor } → frames paused + 15-min nudges", async () => {
  const modal = jest.fn();
  const r = createRunner({ journeyId: "j1", onChallenge: modal });
  reply("SAFE", ["START_CHALLENGE_PAUSE"]);
  await r.send({ type: "SENSOR_PAUSE_REQUEST", sensor: "cam" });
  expect(modal).toHaveBeenCalledWith(expect.objectContaining({ kind: "pause", speakerPrompt: false, typedOnly: true }));
  reply("SAFE", ["CAMERA_PAUSE", "HEIGHTENED_MODE", "NOTIFY_GUARDIANS_CAMERA_PAUSED"]);
  await r.resolveChallenge("__ui_safe__");
  expect(mockPost).toHaveBeenLastCalledWith("/api/journey-state", { journeyId: "j1", event: { type: "CHALLENGE_PASSED", pauseSensor: "cam" } });
  expect(mockPause).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(15 * 60_000);
  expect(mockHaptic).toHaveBeenCalledTimes(2); // 1 on mockPause success + 1 nudge
  reply("SAFE", ["CAMERA_RESUME", "NOTIFY_GUARDIANS_CAMERA_RESUMED"]);
  await r.send({ type: "SENSOR_RESUME", sensor: "cam" });
  expect(mockResume).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(30 * 60_000);
  expect(mockHaptic).toHaveBeenCalledTimes(2); // nudges stopped
});

test("away: secondary posts PLAN_CHANGE; stationary pass restarts the feed clock", async () => {
  const modal = jest.fn();
  const onTier2Passed = jest.fn();
  const r = createRunner({ journeyId: "j1", onChallenge: modal, stationaryFeed: { onTier2Passed } });
  useJourney.getState().set({ ctx: { state: "SAFE", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } });
  reply("SAFE", ["START_CHALLENGE_AWAY", "NOTIFY_GUARDIANS_ROUTE"]);
  await r.send({ type: "ROUTE_DEVIATION", kind: "away" });
  expect(modal).toHaveBeenCalledWith(expect.objectContaining({ kind: "away", secondary: true }));
  reply("AMBER", ["START_CHALLENGE", "NOTIFY_GUARDIANS_AMBER", "FRAME_FAST"]);
  await r.resolveChallenge("secondary");
  expect(mockPost).toHaveBeenLastCalledWith("/api/journey-state", { journeyId: "j1", event: { type: "PLAN_CHANGE" } });
  reply("SAFE", ["START_CHALLENGE_STATIONARY", "NOTIFY_GUARDIANS_STOPPED"]);
  await r.send({ type: "STATIONARY", tier: 2 });
  reply("SAFE", []);
  await r.resolveChallenge("__ui_safe__");
  expect(onTier2Passed).toHaveBeenCalledTimes(1);
});

test("local and server actions are deduplicated: one modal, one mockPause per event", async () => {
  const modal = jest.fn();
  const r = createRunner({ journeyId: "j1", onChallenge: modal });
  useJourney.getState().set({ ctx: { state: "SAFE", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } });
  reply("SAFE", ["START_CHALLENGE_PAUSE"]); // same action the local reducer emits
  await r.send({ type: "SENSOR_PAUSE_REQUEST", sensor: "cam" });
  expect(modal).toHaveBeenCalledTimes(1);
  reply("SAFE", ["CAMERA_PAUSE", "HEIGHTENED_MODE", "NOTIFY_GUARDIANS_CAMERA_PAUSED"]);
  await r.resolveChallenge("__ui_safe__");
  expect(mockPause).toHaveBeenCalledTimes(1);
  expect(useJourney.getState().ctx.cameraPaused).toBe(true);
  // camera loss while paused is ignored; escalation to CRITICAL auto-resumes (ADR-038)
  reply("SAFE", []);
  await r.send({ type: "SENSOR_LOST", sensor: "cam", batteryLow: false });
  expect(useJourney.getState().ctx.state).toBe("SAFE");
  reply("CRITICAL", ["CAMERA_RESUME"]);
  await r.send({ type: "SOS" });
  expect(useJourney.getState().ctx.state).toBe("CRITICAL");
  expect(useJourney.getState().ctx.cameraPaused).toBe(false);
  expect(mockResume).toHaveBeenCalled();
});

test("arm attaches the stationary/route feeds after MONITOR_START; stop detaches them", async () => {
  const r = createRunner({ journeyId: "j1" });
  mockPost.mockResolvedValue({ state: "SAFE", actions: [] });
  await r.arm({ id: "j1", start_at: new Date(Date.now() - 60_000).toISOString(), eta_seconds: 600 });
  await jest.advanceTimersByTimeAsync(0);
  expect(useJourney.getState().ctx.state).toBe("SAFE");
  expect(mockAttach).toHaveBeenCalledTimes(1);
  await r.stop();
  expect(mockDetach).toHaveBeenCalledTimes(1);
});
