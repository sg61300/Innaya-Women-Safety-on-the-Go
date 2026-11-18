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
    auth: { getUser: () => mockGetUser(), getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    from: (t: string) => {
      let status: unknown;
      let openOnly = false;
      const b: any = {
        select: () => b, order: () => b, limit: () => b,
        is: (k: string) => { if (k === "resolved_at") openOnly = true; return b; },
        eq: (k: string, v: unknown) => { if (k === "status") status = v; return b; },
        maybeSingle: async () => (t === "cancel_requests" && !openOnly ? mockTables.current.cancel_latest ?? { data: null } : t === "journeys" && status === "monitoring" && mockTables.current.noMonitoring ? { data: null } : mockTables.current[t] ?? { data: null }),
      };
      return b;
    },
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createRunner } from "../protocolRunner";
import { cancelOfflineMarker } from "../cancelOfflineMarker";
import { eventOutbox } from "../eventOutbox";
import { useJourney } from "../../store/journey";

const CRIT = { state: "CRITICAL" as const, ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const };
beforeEach(async () => {
  await AsyncStorage.clear();
  eventOutbox.resetForTest();
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

// Fix AD round 2, point 9: expiry must not disturb her screen while a cancel waits.
test("G8: local waiting + server expired → no expiry challenge, no notice", async () => {
  useJourney.getState().set({ journey: { id: "jL" }, ctx: { ...CRIT, cancelWaiting: true } });
  mockTables.current = { journeys: { data: { status: "expired" } } };
  await createRunner({}).reconcile();
  const s = useJourney.getState();
  expect(s.challenge).toBeNull();
  expect(s.expiry).toBeNull();
});

test("a restart during a waiting cancel keeps her screen normal", async () => {
  mockTables.current = { journeys: { data: { id: "j9", owner_id: "u1" } }, journey_state: { data: { state: "CRITICAL" } }, cancel_requests: { data: { id: "r1" } } };
  await createRunner({}).reconcile();
  expect(useJourney.getState().ctx.cancelWaiting).toBe(true);
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

// ---- Fix lane R ----
test("H2: a restart adopts the journey's alarm_mode, so a silent alarm stays silent", async () => {
  mockTables.current = { journeys: { data: { id: "j9", owner_id: "u1", alarm_mode: "silent" } }, journey_state: { data: { state: "CRITICAL" } }, cancel_requests: { data: { id: "r1" } } };
  await createRunner({}).reconcile();
  expect(useJourney.getState().ctx.alarmMode).toBe("silent");
  // 2 Not safe after the restart: no siren, because the reducer now knows the mode.
  const mockStart = jest.requireMock("../siren").siren.start as jest.Mock;
  mockPost.mockResolvedValue({ state: "CRITICAL", actions: [] });
  await createRunner({}).send({ type: "GUARDIAN_SAYS_WRONG" });
  expect(mockStart).not.toHaveBeenCalled();
});

test("H2: a journey with no stored mode still adopts as siren", async () => {
  mockTables.current = { journeys: { data: { id: "j9", owner_id: "u1" } }, journey_state: { data: { state: "CRITICAL" } } };
  await createRunner({}).reconcile();
  expect(useJourney.getState().ctx.alarmMode).toBe("siren");
});

test("M9: a restart adopts a waiting cancel on an expired journey", async () => {
  mockTables.current = { noMonitoring: true, journeys: { data: { id: "j9", owner_id: "u1", status: "expired" } }, journey_state: { data: { state: "CRITICAL" } }, cancel_requests: { data: { id: "r1", journey_id: "j9" } } };
  await createRunner({}).reconcile();
  const s = useJourney.getState();
  expect(s.journey?.id).toBe("j9");
  expect(s.ctx.cancelWaiting).toBe(true);
  expect(s.expiry).toBeNull();
  expect(mockLocStart).toHaveBeenCalledTimes(1);
});

test("M9: an expired journey with nothing open is not adopted", async () => {
  mockTables.current = { noMonitoring: true, journeys: { data: { id: "j9", owner_id: "u1", status: "expired" } } };
  await createRunner({}).reconcile();
  expect(useJourney.getState().journey).toBeNull();
});

test("M10: a restart on a pre-0032 held alarm with an open row waits on it", async () => {
  mockTables.current = { journeys: { data: { id: "j9", owner_id: "u1" } }, journey_state: { data: { state: "CANCEL_HOLD" } }, cancel_requests: { data: { id: "r1" } } };
  await createRunner({}).reconcile();
  expect(useJourney.getState().ctx.cancelWaiting).toBe(true);
});

describe("M9: the offline word survives a restart", () => {
  const J = { id: "j7", owner_id: "u1", alarm_mode: "silent" as const };
  test("restart with no network: restored from the phone alone, mode kept, retry on, screen normal", async () => {
    await cancelOfflineMarker.save(J);
    mockGetUser.mockRejectedValue(new Error("Network request failed"));
    await createRunner({}).reconcile();
    const s = useJourney.getState();
    expect(s.journey?.id).toBe("j7");
    expect(s.ctx).toMatchObject({ state: "CRITICAL", cancelWaiting: true, alarmMode: "silent" });
    expect(s.cancelOffline).toBe(true);
    expect(s.expiry).toBeNull();
    expect(s.challenge).toBeNull();
    expect(mockLocStart).toHaveBeenCalledTimes(1);
  });

  test("another account on this phone: not restored", async () => {
    await cancelOfflineMarker.save({ ...J, owner_id: "someone-else" });
    await createRunner({}).reconcile();
    expect(useJourney.getState().journey).toBeNull();
    expect(await cancelOfflineMarker.read()).toBeNull();
  });

  test("a damaged marker is ignored and removed", async () => {
    await AsyncStorage.setItem("vaira.cancelOffline", "{not json");
    expect(await cancelOfflineMarker.read()).toBeNull();
    await createRunner({}).reconcile();
    expect(useJourney.getState().journey).toBeNull();
  });

  test("nothing saved: a normal restart is untouched", async () => {
    mockTables.current = { journeys: { data: null } };
    await createRunner({}).reconcile();
    expect(useJourney.getState().cancelOffline).toBe(false);
  });
});

describe("D3-5 the emergency word while waiting", () => {
  const WAIT = { ...CRIT, cancelWaiting: true };
  test("no siren, request off locally, the server is told, guardians alerted by it", async () => {
    useJourney.getState().set({ journey: { id: "j1" }, ctx: WAIT });
    mockPost.mockResolvedValue({ state: "CRITICAL", actions: ["NOTIFY_ALL_CRITICAL"] });
    const r = createRunner({});
    r.onKeyword("emergency");
    await r.send({ type: "SIGNALS_SAFE" }); // waits for the queue
    const start = jest.requireMock("../siren").siren.start as jest.Mock;
    expect(start).not.toHaveBeenCalled();
    expect(useJourney.getState().ctx).toMatchObject({ state: "CRITICAL", quietAlarm: true });
    expect(mockPost).toHaveBeenCalledWith("/api/journey-state", { journeyId: "j1", event: { type: "KEYWORD", kind: "emergency" } });
  });

  test("a restart keeps it quiet", async () => {
    mockTables.current = { journeys: { data: { id: "j9", owner_id: "u1" } }, journey_state: { data: { state: "CRITICAL" } }, cancel_latest: { data: { verdict: "distress" } } };
    await createRunner({}).reconcile();
    expect(useJourney.getState().ctx).toMatchObject({ state: "CRITICAL", quietAlarm: true });
  });

  test("a restart on an ordinary CRITICAL shows the alarm as today", async () => {
    mockTables.current = { journeys: { data: { id: "j9", owner_id: "u1" } }, journey_state: { data: { state: "CRITICAL" } }, cancel_latest: { data: { verdict: "keep" } } };
    await createRunner({}).reconcile();
    expect(useJourney.getState().ctx.quietAlarm).toBeFalsy();
  });

  test("a drill: the word stays on the phone, nobody is contacted", async () => {
    useJourney.getState().set({ journey: { id: "j1" }, ctx: WAIT });
    const r = createRunner({});
    r.setPractice(true);
    await r.send({ type: "KEYWORD", kind: "emergency" });
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe("D4", () => {
  const camStart = () => (require("../camera").camera.start as jest.Mock);
  const sirenStart = () => (require("../siren").siren.start as jest.Mock);
  const waiting = { ...CRIT, cancelWaiting: true };
  const offline = () => mockPost.mockRejectedValue(new TypeError("Network request failed"));

  test("H1 the emergency word with its post failing is kept and delivered later", async () => {
    useJourney.getState().set({ journey: { id: "j1", owner_id: "u1" }, ctx: waiting, camRunning: true });
    offline();
    await createRunner({}).send({ type: "KEYWORD", kind: "emergency" });
    expect(useJourney.getState().ctx.quietAlarm).toBe(true);
    expect(await eventOutbox.pending()).toBe(1);
    mockPost.mockReset().mockResolvedValue({});
    await eventOutbox.deliver();
    expect(mockPost).toHaveBeenCalledWith("/api/journey-state", { journeyId: "j1", event: { type: "KEYWORD", kind: "emergency" } });
    expect(await eventOutbox.pending()).toBe(0);
  });

  test("H1 online: posted once, the reply is used, nothing left behind", async () => {
    useJourney.getState().set({ journey: { id: "j1", owner_id: "u1" }, ctx: waiting, camRunning: true });
    mockPost.mockResolvedValue({ state: "CRITICAL", actions: [] });
    await createRunner({}).send({ type: "KEYWORD", kind: "emergency" });
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(await eventOutbox.pending()).toBe(0);
  });

  test("H1 offline correct word then emergency word: cancel first, then the word; the marker keeps it quiet over a restart", async () => {
    useJourney.getState().set({ journey: { id: "j1", owner_id: "u1" }, ctx: waiting, cancelOffline: true, camRunning: true });
    await cancelOfflineMarker.save({ id: "j1", owner_id: "u1", alarm_mode: "silent" });
    await eventOutbox.ensureCancel("j1", "silent");
    offline();
    await createRunner({}).send({ type: "KEYWORD", kind: "emergency" });
    expect(mockPost.mock.calls.map((c) => c[0])).not.toContain("/api/journey-state"); // never overtakes the cancel
    await eventOutbox.deliver();
    expect((await cancelOfflineMarker.read())?.quiet).toBe(true);
    // Killed here. A fresh app, still offline:
    useJourney.getState().reset();
    await createRunner({}).reconcile();
    const s = useJourney.getState();
    expect(s.ctx).toMatchObject({ state: "CRITICAL", quietAlarm: true, alarmMode: "silent" });
    expect(s.ctx.cancelWaiting).toBeFalsy();
    expect(s.challenge).toBeNull();
    await eventOutbox.deliver();
    mockPost.mockReset().mockResolvedValue({});
    await eventOutbox.deliver();
    expect(mockPost.mock.calls.map((c) => c[0])).toEqual(["/api/cancel-request", "/api/journey-state"]);
  });

  test("H1 a raised alarm is kept too, so a later cancel is not refused by a server that never heard", async () => {
    useJourney.getState().set({ journey: { id: "j1", owner_id: "u1" }, ctx: { ...CRIT, state: "SAFE" }, camRunning: true });
    offline();
    await createRunner({}).send({ type: "SOS", mode: "silent" });
    expect(await eventOutbox.pending()).toBe(1);
    expect(sirenStart()).not.toHaveBeenCalled();
  });

  test("H1 calm events are not queued", async () => {
    useJourney.getState().set({ journey: { id: "j1", owner_id: "u1" }, ctx: { ...CRIT, state: "SAFE" }, camRunning: true });
    offline();
    await createRunner({}).send({ type: "SIGNALS_SAFE" });
    expect(await eventOutbox.pending()).toBe(0);
  });

  test("H2 a silent alarm stays silent whatever the server reply asks for", async () => {
    useJourney.getState().set({ journey: { id: "j1", owner_id: "u1" }, ctx: { ...CRIT, alarmMode: "silent" }, camRunning: true });
    mockPost.mockResolvedValue({ state: "CRITICAL", actions: ["SIREN_ON"] });
    await createRunner({}).send({ type: "SCORE", score: 3, reasons: [] as never });
    expect(sirenStart()).not.toHaveBeenCalled();
  });

  test.each(["waiting", "quiet"])("M1 restart restored from the marker (%s): photos start", async (kind) => {
    await cancelOfflineMarker.save({ id: "j1", owner_id: "u1", alarm_mode: "silent", quiet: kind === "quiet" });
    await createRunner({}).reconcile();
    expect(camStart()).toHaveBeenCalledWith("j1", expect.any(Function));
  });

  test("M1 restart adopting from the server while waiting: photos start", async () => {
    mockTables.current = { journeys: { data: { id: "j9", owner_id: "u1" } }, journey_state: { data: { state: "CRITICAL" } }, cancel_requests: { data: { id: "r1" } } };
    await createRunner({}).reconcile();
    expect(camStart()).toHaveBeenCalledWith("j9", expect.any(Function));
  });

  test("M1 restart adopting a quiet alarm: photos start, and it stays quiet", async () => {
    mockTables.current = { journeys: { data: { id: "j9", owner_id: "u1" } }, journey_state: { data: { state: "CRITICAL" } }, cancel_latest: { data: { verdict: "distress" } } };
    await createRunner({}).reconcile();
    expect(useJourney.getState().ctx.quietAlarm).toBe(true);
    expect(camStart()).toHaveBeenCalledWith("j9", expect.any(Function));
  });

  test("M1 a loop already running is left alone", async () => {
    useJourney.getState().set({ camRunning: true });
    await cancelOfflineMarker.save({ id: "j1", owner_id: "u1" });
    await createRunner({}).reconcile();
    expect(camStart()).not.toHaveBeenCalled();
  });

  test("M3 quiet alarm, server expired, app returns: no challenge, no modal, nothing spoken", async () => {
    useJourney.getState().set({ journey: { id: "j1", owner_id: "u1" }, ctx: { ...CRIT, quietAlarm: true } });
    mockTables.current = { journeys: { data: { status: "expired" } } };
    jest.clearAllTimers(); // other tests' challenges
    await createRunner({}).reconcile();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(useJourney.getState().challenge).toBeNull();
    expect(useJourney.getState().expiry).toBeNull();
    expect(require("../siren").siren.speak).not.toHaveBeenCalled();
  });

  test.each([["siren", 1], ["silent", 0]])("M6 overturn adopted (%s): alarm back at once, sirens=%i, nothing posted", async (mode, sirens) => {
    useJourney.getState().set({ journey: { id: "j1", owner_id: "u1" }, ctx: { ...CRIT, state: "RESOLVED_MONITORING", heightened: true, alarmMode: mode as "siren" | "silent" }, cancelApproved: true });
    await createRunner({}).adoptOverturn();
    const s = useJourney.getState();
    expect(s.ctx).toMatchObject({ state: "CRITICAL", alarmMode: mode });
    expect(s.cancelApproved).toBe(false);
    expect(sirenStart()).toHaveBeenCalledTimes(sirens as number);
    expect(mockPost).not.toHaveBeenCalled();
  });

  test("M6 only from monitoring after a Safe", async () => {
    useJourney.getState().set({ journey: { id: "j1" }, ctx: CRIT });
    await createRunner({}).adoptOverturn();
    expect(sirenStart()).not.toHaveBeenCalled();
  });
});
