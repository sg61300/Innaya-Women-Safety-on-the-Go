// Task 27 — protocol runner: exact challenge timers, safe-word resolution, server authority.
jest.useFakeTimers();
const mockSpeak = jest.fn(), mockSirenStart = jest.fn(), mockSirenStop = jest.fn(), mockSirenHold = jest.fn();
jest.mock("../services/siren", () => ({ siren: { speak: (...a: unknown[]) => mockSpeak(...a), start: () => mockSirenStart(), stop: () => mockSirenStop(), hold: () => mockSirenHold() } }));
const mockFlowStart = jest.fn(), mockFlowAmber = jest.fn(), mockFlowDispose = jest.fn();
jest.mock("../services/cancelFlow", () => ({ cancelFlow: { start: (...a: unknown[]) => mockFlowStart(...a), startAmberHold: (...a: unknown[]) => mockFlowAmber(...a), dispose: (...a: unknown[]) => mockFlowDispose(...a), callGuardian: jest.fn() } }));
jest.mock("../services/location", () => ({ location: { start: jest.fn(), stop: jest.fn() } }));
const mockCameraStart = jest.fn();
jest.mock("../services/camera", () => ({ camera: { start: (...a: unknown[]) => mockCameraStart(...a), stop: jest.fn(), attach: jest.fn(), setPaused: jest.fn() } }));
const mockPost = jest.fn();
jest.mock("../lib/api", () => ({ post: (...a: unknown[]) => mockPost(...a) }));
jest.mock("../lib/events", () => ({ events: { log: jest.fn().mockResolvedValue(undefined), flush: jest.fn().mockResolvedValue(undefined) } }));
const mockWordsGet = jest.fn().mockResolvedValue(["purple kettle"]);
const mockGetJourneyWord = jest.fn().mockResolvedValue(null);
const mockVerifyJourneyWord = jest.fn().mockResolvedValue(null);
jest.mock("../services/secureWords", () => ({
  secureWords: {
    get: (...a: unknown[]) => mockWordsGet(...a),
    getJourneySafeWord: (...a: unknown[]) => mockGetJourneyWord(...a),
    verifyJourneySafeWord: (...a: unknown[]) => mockVerifyJourneyWord(...a),
  },
}));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 1 } }));
import { runner } from "../services/protocolRunner";
import { events } from "../lib/events";
import { useJourney } from "../store/journey";

const base = { ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } as const;
const journey = { id: "j1", owner_id: "u", start_at: new Date().toISOString(), eta_seconds: 600 };

beforeEach(() => {
  jest.clearAllMocks();
  mockWordsGet.mockResolvedValue(["purple kettle"]);
  mockGetJourneyWord.mockResolvedValue(null);
  mockVerifyJourneyWord.mockResolvedValue(null);
  mockPost.mockResolvedValue({ state: "SAFE", actions: [] });
  useJourney.getState().set({ journey, ctx: { ...base, state: "SAFE" }, challenge: null });
});

test("D11: analyze danger is mapped to the protocol score before escalation", async () => {
  await runner.arm({ ...journey, start_at: new Date().toISOString() });
  await jest.advanceTimersByTimeAsync(0);
  const callback = mockCameraStart.mock.calls[0]?.[1] as ((result: unknown) => void) | undefined;
  expect(callback).toBeDefined();
  callback?.({ danger: 3, reasons: ["weapon"] });
  await jest.advanceTimersByTimeAsync(0);
  expect(useJourney.getState().ctx.state).toBe("CRITICAL");
});

test("score 1 → AMBER, speaker prompt at 3 s, CRITICAL + siren at 5 s", async () => {
  await runner.send({ type: "SCORE", score: 1, reasons: ["isolated_location"] });
  expect(useJourney.getState().ctx.state).toBe("AMBER");
  expect(useJourney.getState().challenge).toMatchObject({ kind: "check", speakerPrompt: true });
  await jest.advanceTimersByTimeAsync(2999);
  expect(mockSpeak).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1);
  expect(mockSpeak).toHaveBeenCalledWith("Are you safe? Say your safe word.");
  await jest.advanceTimersByTimeAsync(1999);
  expect(useJourney.getState().ctx.state).toBe("AMBER");
  await jest.advanceTimersByTimeAsync(1);
  expect(useJourney.getState().ctx.state).toBe("CRITICAL");
  expect(mockSirenStart).toHaveBeenCalled();
  expect(useJourney.getState().challenge).toBeNull();
});

test("arrival + safe word reaches RESOLVED and emits journey_completed once", async () => {
  // Server agrees with the terminal state (a server RESOLVED is never re-adopted).
  mockPost.mockResolvedValue({ state: "RESOLVED", actions: [] });
  // ADR-043 rule 6: with an active journey the safe word is verified against the
  // per-journey SecureStore cache (or the journey's server hash), never the global
  // history. This journey's word lives in that cache.
  mockGetJourneyWord.mockResolvedValue("purple kettle");
  await runner.send({ type: "ARRIVED" });
  expect(useJourney.getState().challenge).toMatchObject({ kind: "arrival" });
  await runner.resolveChallenge("Purple Kettle");
  expect(useJourney.getState().ctx.state).toBe("RESOLVED");
  const completed = (events.log as jest.Mock).mock.calls.filter((c) => c[0] === "journey_completed");
  expect(completed).toHaveLength(1);
});

test("correct safe word resolves the challenge and cancels the 5 s deadline", async () => {
  // ADR-043 rule 6: the journey's word verifies via the per-journey cache, not history.
  mockGetJourneyWord.mockResolvedValue("purple kettle");
  await runner.send({ type: "GUARDIAN_CONCERN" });
  expect(useJourney.getState().challenge).not.toBeNull();
  await runner.resolveChallenge("Purple Kettle");
  expect(useJourney.getState().challenge).toBeNull();
  const after = useJourney.getState().ctx.state;
  await jest.advanceTimersByTimeAsync(5000);
  expect(useJourney.getState().ctx.state).toBe(after);
  expect(mockSirenStart).not.toHaveBeenCalled();
});

test("wrong word does not resolve; the deadline still escalates", async () => {
  await runner.send({ type: "GUARDIAN_CONCERN" });
  await runner.resolveChallenge("banana");
  expect(useJourney.getState().challenge).not.toBeNull();
  await jest.advanceTimersByTimeAsync(5000);
  expect(useJourney.getState().ctx.state).toBe("CRITICAL");
});

test("emergency keyword and SOS go straight to CRITICAL with no challenge (ADR-013)", async () => {
  runner.onKeyword("emergency", "blue mango");
  await jest.advanceTimersByTimeAsync(0);
  expect(useJourney.getState().ctx.state).toBe("CRITICAL");
  expect(useJourney.getState().challenge).toBeNull();
  expect(mockSirenStart).toHaveBeenCalledTimes(1);
});

test("current journey word is authoritative; an older history word cannot end it", async () => {
  mockPost.mockResolvedValue({ state: "RESOLVED", actions: [] });
  mockWordsGet.mockResolvedValue(["old journey word"]);
  mockVerifyJourneyWord.mockResolvedValue(false);
  useJourney.getState().set({
    journey: { ...journey, are_you_safe_word_hash: "current-hash" },
    ctx: { ...base, state: "SAFE" },
    challenge: null,
  });
  await runner.send({ type: "ARRIVED" });
  await runner.resolveChallenge("old journey word");
  expect(useJourney.getState().ctx.state).toBe("SAFE");
  expect(useJourney.getState().challenge).not.toBeNull();
  mockGetJourneyWord.mockResolvedValue("current journey word");
  mockVerifyJourneyWord.mockResolvedValue(true);
  await runner.resolveChallenge("current journey word");
  expect(useJourney.getState().ctx.state).toBe("RESOLVED");
});

test("emergency overlay uses the same current-journey word rule", async () => {
  mockWordsGet.mockResolvedValue(["old journey word"]);
  mockVerifyJourneyWord.mockResolvedValue(false);
  useJourney.getState().set({
    journey: { ...journey, are_you_safe_word_hash: "current-hash" },
    ctx: { ...base, state: "EMERGENCY" },
    challenge: null,
  });
  await expect(runner.resolveChallenge("old journey word")).resolves.toBe(false);
  expect(mockPost).not.toHaveBeenCalled();
  mockGetJourneyWord.mockResolvedValue("current journey word");
  mockVerifyJourneyWord.mockResolvedValue(true);
  await expect(runner.resolveChallenge("current journey word")).resolves.toBe(true);
  expect(mockPost).toHaveBeenCalledWith("/api/journey-state", { journeyId: "j1", event: { type: "CHALLENGE_PASSED", guardianConfirmed: false } });
});

test("an SOS on an existing journey starts the camera when no loop is running", async () => {
  useJourney.getState().set({ journey, ctx: { ...base, state: "SAFE" }, camRunning: false });
  await runner.send({ type: "SOS" });
  expect(useJourney.getState().ctx.state).toBe("CRITICAL");
  expect(mockCameraStart).toHaveBeenCalledWith(journey.id, expect.any(Function));
});

test("a higher server state is adopted and the siren started; a lower one is ignored", async () => {
  mockPost.mockResolvedValueOnce({ state: "EMERGENCY", actions: [] });
  await runner.send({ type: "SIGNALS_SAFE" });
  expect(useJourney.getState().ctx.state).toBe("EMERGENCY");
  expect(mockSirenStart).toHaveBeenCalledTimes(1);
  mockPost.mockResolvedValueOnce({ state: "SAFE", actions: [] });
  await runner.send({ type: "SIGNALS_SAFE" });
  expect(useJourney.getState().ctx.state).toBe("EMERGENCY");
});

test("server unreachable → local authority, no throw", async () => {
  mockPost.mockRejectedValueOnce(new Error("offline"));
  await expect(runner.send({ type: "SCORE", score: 1, reasons: ["isolated_location"] })).resolves.toBeUndefined();
  expect(useJourney.getState().ctx.state).toBe("AMBER");
});

test("practice mode never starts the siren or posts to the server", async () => {
  runner.setPractice(true);
  await runner.send({ type: "SOS" });
  expect(useJourney.getState().ctx.state).toBe("CRITICAL");
  expect(mockSirenStart).not.toHaveBeenCalled();
  expect(mockPost).not.toHaveBeenCalled();
  runner.setPractice(false);
});



test("stop() disposes the cancel flow (Task 29b)", async () => {
  await runner.stop();
  expect(mockFlowDispose).toHaveBeenCalled();
});

test("tick: arrival within ETA fires ARRIVED once; ETA passed without arrival fires LATE once", async () => {
  const now = Date.now();
  useJourney.getState().set({ journey: { ...journey, to_lat: 12.97, to_lng: 77.59, start_at: new Date(now).toISOString(), eta_seconds: 600 } });
  runner.tick({ lat: 12.9701, lng: 77.5901 });
  runner.tick({ lat: 12.9701, lng: 77.5901 });
  await jest.advanceTimersByTimeAsync(0);
  expect(mockPost).toHaveBeenCalledTimes(1);
  expect(mockPost.mock.calls[0][1]).toMatchObject({ event: { type: "ARRIVED" } });

  useJourney.getState().set({ journey: { ...journey, to_lat: 12.97, to_lng: 77.59, start_at: new Date(now - 700_000).toISOString(), eta_seconds: 600 }, ctx: { ...base, state: "SAFE" } });
  runner.tick({ lat: 13.1, lng: 77.7 });
  runner.tick({ lat: 13.1, lng: 77.7 });
  await jest.advanceTimersByTimeAsync(0);
  expect(mockPost.mock.calls.filter((c) => c[1].event.type === "LATE")).toHaveLength(1);
  expect(useJourney.getState().ctx.state).toBe("LATE_CHECK");
});

// D16: a route-deviation detour in SAFE must open a visible ARE-YOU-SAFE challenge
// (the modal reads store.challenge) for the whole window, then time out to CRITICAL.
test("D16: route deviation opens a store challenge the modal renders, then times out to CRITICAL", async () => {
  useJourney.getState().set({ journey, ctx: { ...base, state: "SAFE" }, challenge: null });
  await runner.send({ type: "ROUTE_DEVIATION", kind: "detour" });
  const c = useJourney.getState().challenge;
  expect(c).toMatchObject({ kind: "route", speakerPrompt: true });
  expect(useJourney.getState().ctx.state).toBe("SAFE"); // challenge open, not yet escalated
  await jest.advanceTimersByTimeAsync(5000);
  expect(useJourney.getState().ctx.state).toBe("CRITICAL");
  expect(useJourney.getState().challenge).toBeNull();
});
