// ADR-042 / R47b + R47c: reconcile() makes the alarm follow the account and shows
// the expiry are-you-safe when the phone returns to an already-archived alarm.
jest.useFakeTimers();
const mockPost = jest.fn();
jest.mock("../../lib/api", () => ({ post: (...a: unknown[]) => mockPost(...a) }));
jest.mock("../../lib/events", () => ({ events: { log: jest.fn().mockResolvedValue(undefined), flush: jest.fn().mockResolvedValue(undefined) } }));
const mockLocStart = jest.fn(), mockLocStop = jest.fn();
jest.mock("../location", () => ({ location: { start: () => mockLocStart(), stop: () => mockLocStop() } }));
jest.mock("../camera", () => ({ camera: { start: jest.fn(), stop: jest.fn(), attach: jest.fn(), setPaused: jest.fn() } }));
const mockSirenStop = jest.fn();
jest.mock("../siren", () => ({ siren: { speak: jest.fn(), start: jest.fn(), stop: () => mockSirenStop(), hold: jest.fn() } }));
jest.mock("../secureWords", () => ({ secureWords: { get: async () => [] } }));
jest.mock("../feeds", () => ({ feeds: { attach: jest.fn(), detach: jest.fn() } }));
jest.mock("../frameLoop", () => ({ frameLoop: { pause: jest.fn(), resume: jest.fn() } }));
jest.mock("../cancelFlow", () => ({ cancelFlow: { start: jest.fn(), startAmberHold: jest.fn(), dispose: jest.fn() } }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 1 }, NotificationFeedbackType: { Error: 1 } }));

const mockGetUser = jest.fn();
const mockTables: { current: Record<string, any> } = { current: {} };
jest.mock("../../lib/supabase", () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (t: string) => {
      const b: any = { select: () => b, eq: () => b, order: () => b, limit: () => b, maybeSingle: async () => mockTables.current[t] };
      return b;
    },
  },
}));

import { createRunner } from "../protocolRunner";
import { useJourney } from "../../store/journey";

const CRIT = { state: "CRITICAL" as const, ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const };
beforeEach(() => {
  jest.clearAllMocks();
  useJourney.getState().reset();
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  mockTables.current = {};
});

test("unauthenticated → reconcile does nothing", async () => {
  mockGetUser.mockResolvedValue({ data: { user: null } });
  useJourney.getState().set({ journey: { id: "jL" }, ctx: CRIT });
  await createRunner({}).reconcile();
  expect(mockLocStart).not.toHaveBeenCalled();
  expect(useJourney.getState().challenge).toBeNull();
});

test("fresh store + server monitoring CRITICAL → adopt + start monitoring", async () => {
  mockTables.current = { journeys: { data: { id: "j9", owner_id: "u1" } }, journey_state: { data: { state: "CRITICAL" } } };
  await createRunner({}).reconcile();
  const s = useJourney.getState();
  expect(s.journey?.id).toBe("j9");
  expect(s.ctx.state).toBe("CRITICAL");
  expect(mockLocStart).toHaveBeenCalledTimes(1);
});

test("no journey anywhere → nothing adopted", async () => {
  mockTables.current = { journeys: { data: null } };
  await createRunner({}).reconcile();
  expect(useJourney.getState().journey).toBeNull();
  expect(mockLocStart).not.toHaveBeenCalled();
});

test("local CRITICAL + server expired → expiry challenge + notice", async () => {
  useJourney.getState().set({ journey: { id: "jL" }, ctx: CRIT });
  mockTables.current = { journeys: { data: { status: "expired" } } };
  await createRunner({}).reconcile();
  const s = useJourney.getState();
  expect(s.challenge?.kind).toBe("expiry");
  expect(s.expiry).toMatchObject({ variant: "expired" });
});

test("server done → notice variant 'ended'", async () => {
  useJourney.getState().set({ journey: { id: "jL" }, ctx: CRIT });
  mockTables.current = { journeys: { data: { status: "done" } } };
  await createRunner({}).reconcile();
  expect(useJourney.getState().expiry).toMatchObject({ variant: "ended" });
});

test("expiry pass → siren off + local resolve, notice stays resolved", async () => {
  useJourney.getState().set({ journey: { id: "jL" }, ctx: CRIT });
  mockTables.current = { journeys: { data: { status: "expired" } } };
  const r = createRunner({});
  await r.reconcile();
  await r.resolveChallenge("__ui_safe__");
  const s = useJourney.getState();
  expect(mockSirenStop).toHaveBeenCalled();
  expect(s.ctx.state).toBe("RESOLVED");
  expect(s.expiry?.resolved).toBe(true);
  expect(s.challenge).toBeNull();
});

test("expiry timeout → expiry_reraise_failed logged, no SOS, siren stays on, overlay stays", async () => {
  useJourney.getState().set({ journey: { id: "jL" }, ctx: CRIT });
  mockTables.current = { journeys: { data: { status: "expired" } } };
  mockPost.mockResolvedValue({ state: "CRITICAL", actions: [] });
  const { events } = require("../../lib/events");
  const r = createRunner({});
  await r.reconcile();
  await jest.advanceTimersByTimeAsync(6000); // > 5 s CRITICAL window
  expect(mockPost).not.toHaveBeenCalledWith("/api/journey-state", { journeyId: "jL", event: { type: "SOS" } });
  expect(events.log).toHaveBeenCalledWith("expiry_reraise_failed", expect.objectContaining({ reason: "timeout" }), "jL");
  expect(mockSirenStop).not.toHaveBeenCalled();
  expect(useJourney.getState().challenge).not.toBeNull();
});

test("expiry danger answer → expiry_reraise_failed logged, no SOS, siren stays on", async () => {
  useJourney.getState().set({ journey: { id: "jL" }, ctx: CRIT });
  mockTables.current = { journeys: { data: { status: "expired" } } };
  const { events } = require("../../lib/events");
  const r = createRunner({});
  await r.reconcile();
  await r.resolveChallenge("danger");
  expect(mockPost).not.toHaveBeenCalledWith("/api/journey-state", { journeyId: "jL", event: { type: "SOS" } });
  expect(events.log).toHaveBeenCalledWith("expiry_reraise_failed", expect.objectContaining({ reason: "danger" }), "jL");
  expect(mockSirenStop).not.toHaveBeenCalled();
});

test("server expired but local not in alarm → no expiry notice (rank rule owns it)", async () => {
  useJourney.getState().set({ journey: { id: "jL" }, ctx: { ...CRIT, state: "SAFE" } });
  mockTables.current = { journeys: { data: { id: "jL", owner_id: "u1" } }, journey_state: { data: { state: "SAFE" } } };
  await createRunner({}).reconcile();
  expect(useJourney.getState().challenge).toBeNull();
  expect(useJourney.getState().expiry).toBeNull();
});
