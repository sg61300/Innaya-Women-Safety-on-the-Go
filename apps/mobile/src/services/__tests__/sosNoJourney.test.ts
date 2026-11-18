// J2 (b12): SOS / an emergency word from Home (IDLE/ARMED, no journey) enters
// CRITICAL locally (H5), but run() skips the /api/journey-state POST when jid() is
// null — so guardians are never alerted while the overlay claims they were. The
// runner must create a minimal emergency journey server-side, then sync CRITICAL
// with that new id. If the create fails (offline) it must not crash: keep local
// CRITICAL, log sos_no_journey, and flag guardiansPending so the overlay shows
// "Reaching your guardians…" instead of a done tick.
const mockPost = jest.fn();
jest.mock("../../lib/api", () => ({ post: (...a: unknown[]) => mockPost(...a) }));
const mockLog = jest.fn((..._a: unknown[]) => Promise.resolve());
jest.mock("../../lib/events", () => ({ events: { log: (...a: unknown[]) => mockLog(...a), flush: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("../location", () => ({ location: { start: jest.fn(), stop: jest.fn() } }));
jest.mock("../camera", () => ({ camera: { start: jest.fn(), stop: jest.fn(), attach: jest.fn(), setPaused: jest.fn() } }));
jest.mock("../siren", () => ({ siren: { speak: jest.fn(), start: jest.fn(), stop: jest.fn(), hold: jest.fn() } }));
jest.mock("../secureWords", () => ({ secureWords: { get: async () => [] } }));
jest.mock("../feeds", () => ({ feeds: { attach: jest.fn(), detach: jest.fn() } }));
jest.mock("../cancelFlow", () => ({ cancelFlow: { start: jest.fn(), startAmberHold: jest.fn(), dispose: jest.fn() } }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 1 } }));
const mockGetUser = jest.fn();
jest.mock("../../lib/supabase", () => ({ supabase: { auth: { getUser: () => mockGetUser() } } }));
const mockCreate = jest.fn();
jest.mock("../journey", () => ({ createEmergencyJourney: (...a: unknown[]) => mockCreate(...a) }));

import { createRunner } from "../protocolRunner";
import { useJourney } from "../../store/journey";

const IDLE = { state: "IDLE", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } as const;

beforeEach(() => {
  jest.clearAllMocks();
  useJourney.getState().set({ journey: null, ctx: { ...IDLE }, challenge: null, guardiansPending: false } as never);
});

test("SOS from Home (no journey) → creates an emergency journey and syncs CRITICAL with the new id", async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  mockCreate.mockResolvedValue({ id: "sos-1" });
  mockPost.mockResolvedValue({ state: "CRITICAL", actions: [] });

  const r = createRunner(); // no journeyId → jid() reads the (null) store journey
  await r.send({ type: "SOS" });

  expect(mockCreate).toHaveBeenCalledWith("u1");
  expect(mockPost).toHaveBeenCalledWith("/api/journey-state", { journeyId: "sos-1", event: { type: "SOS" } });
  expect(useJourney.getState().journey).toEqual({ id: "sos-1", owner_id: "u1" });
  expect((useJourney.getState() as never as { guardiansPending: boolean }).guardiansPending).toBe(false);
  expect(useJourney.getState().ctx.state).toBe("CRITICAL");
});

test("offline: emergency-journey create fails → no crash, no POST, local CRITICAL kept, guardians pending, sos_no_journey logged", async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  mockCreate.mockRejectedValue(new Error("network"));

  const r = createRunner();
  await expect(r.send({ type: "SOS" })).resolves.toBeUndefined();

  expect(mockPost).not.toHaveBeenCalled();
  expect(useJourney.getState().ctx.state).toBe("CRITICAL");
  expect((useJourney.getState() as never as { guardiansPending: boolean }).guardiansPending).toBe(true);
  expect(mockLog).toHaveBeenCalledWith("sos_no_journey", expect.objectContaining({ ok: false }), null);
});

test("SOS during an armed journey (journey present) → no emergency journey created, syncs with the existing id", async () => {
  mockPost.mockResolvedValue({ state: "CRITICAL", actions: [] });
  const r = createRunner({ journeyId: "real-j" });
  await r.send({ type: "SOS" });

  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockPost).toHaveBeenCalledWith("/api/journey-state", { journeyId: "real-j", event: { type: "SOS" } });
});
