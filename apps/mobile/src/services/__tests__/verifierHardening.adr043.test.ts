// ADR-043 item 5 (concern 1) — safe-word verifier hardening.
// With an active journey ONLY that journey's word verifies (per-journey cache or
// its server hash). The global history and the literal "safe" are rejected; the
// SAFE button's internal token still passes.
jest.useFakeTimers();
const mockPost = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/api", () => ({ post: (...a: unknown[]) => mockPost(...a) }));
const mockLog = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/events", () => ({ events: { log: (...a: unknown[]) => mockLog(...a), flush: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("../location", () => ({ location: { start: jest.fn(), stop: jest.fn() } }));
jest.mock("../camera", () => ({ camera: { start: jest.fn(), stop: jest.fn() } }));
jest.mock("../siren", () => ({ siren: { speak: jest.fn(), start: jest.fn(), stop: jest.fn() } }));
jest.mock("../frameLoop", () => ({ frameLoop: { pause: jest.fn(), resume: jest.fn() } }));
jest.mock("../feeds", () => ({ feeds: { attach: jest.fn(), detach: jest.fn() } }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 1 } }));

const mockGetHistory = jest.fn<Promise<string[]>, [string]>().mockResolvedValue([]);
const mockGetJourneyWord = jest.fn<Promise<string | null>, [string]>().mockResolvedValue(null);
const mockVerifyJourney = jest.fn<Promise<boolean | null>, [string, unknown]>().mockResolvedValue(null);
jest.mock("../secureWords", () => ({
  secureWords: {
    get: (k: string) => mockGetHistory(k),
    getJourneySafeWord: (id: string) => mockGetJourneyWord(id),
    verifyJourneySafeWord: (input: string, j: unknown) => mockVerifyJourney(input, j),
  },
}));

import { createRunner } from "../protocolRunner";
import { useJourney } from "../../store/journey";

const openCheck = () =>
  useJourney.getState().set({
    challenge: { kind: "check", reason: "x", ending: false, deadline: Date.now() + 5000, speakerPrompt: true, typedOnly: false, secondary: false } as never,
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetHistory.mockResolvedValue(["oldword"]); // j1's word lives in the global history
  mockGetJourneyWord.mockResolvedValue(null);
  mockVerifyJourney.mockResolvedValue(null);
  useJourney.getState().set({
    journey: { id: "j2", owner_id: "u1" },
    ctx: { state: "AMBER", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } as never,
    challenge: null,
  });
});

test("old journey word is rejected while journey 2 is active (ONLINE: server says not-this-journey)", async () => {
  mockGetJourneyWord.mockResolvedValue(null); // no cache
  mockVerifyJourney.mockResolvedValue(false); // server: 'oldword' is not j2's hash
  const r = createRunner({ journeyId: "j2" });
  openCheck();
  expect(await r.resolveChallenge("oldword")).toBe(false);
  expect(mockVerifyJourney).toHaveBeenCalledWith("oldword", expect.objectContaining({ id: "j2" }));
});

test("old journey word is rejected while journey 2 is active (OFFLINE: cache only, no server)", async () => {
  mockGetJourneyWord.mockResolvedValue("bluebird"); // j2's cached word
  mockVerifyJourney.mockResolvedValue(null); // offline
  const r = createRunner({ journeyId: "j2" });
  openCheck();
  expect(await r.resolveChallenge("oldword")).toBe(false); // history word does NOT match the cache
  openCheck();
  expect(await r.resolveChallenge("bluebird")).toBe(true); // the real j2 word matches offline
});

test("both cache and server unavailable → false + logs safe_word_unverifiable", async () => {
  mockGetJourneyWord.mockResolvedValue(null);
  mockVerifyJourney.mockResolvedValue(null);
  const r = createRunner({ journeyId: "j2" });
  openCheck();
  expect(await r.resolveChallenge("anything")).toBe(false);
  expect(mockLog).toHaveBeenCalledWith("safe_word_unverifiable", { journeyId: "j2" }, expect.anything());
});

test('typed "safe" is rejected under an active journey', async () => {
  mockGetJourneyWord.mockResolvedValue("bluebird");
  mockVerifyJourney.mockResolvedValue(false);
  const r = createRunner({ journeyId: "j2" });
  openCheck();
  expect(await r.resolveChallenge("safe")).toBe(false);
  openCheck();
  expect(await r.resolveChallenge("SAFE")).toBe(false);
});

test("SAFE button token __ui_safe__ still passes", async () => {
  const r = createRunner({ journeyId: "j2" });
  openCheck();
  expect(await r.resolveChallenge("__ui_safe__")).toBe(true);
});

test("no active journey: the global history verifies and literal safe is rejected", async () => {
  useJourney.getState().set({ journey: null });
  mockGetHistory.mockResolvedValue(["campfire"]);
  const r = createRunner({});
  openCheck();
  expect(await r.resolveChallenge("campfire")).toBe(true);
  openCheck();
  expect(await r.resolveChallenge("safe")).toBe(false);
});
