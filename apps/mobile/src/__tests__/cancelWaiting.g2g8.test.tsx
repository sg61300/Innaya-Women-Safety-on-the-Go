// Fix AD round 2, G1/G2/G5/G8 on the phone (founder Q78, Q93, Q95, Q101): the correct
// word puts her on a normal screen with one honest line, online and offline. Offline
// retries wait for the network, and a drill never contacts a guardian.
import { render, act, fireEvent } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { initialContext, transition } from "@vaira/core";
import { useJourney } from "../store/journey";

const mockSend = jest.fn().mockResolvedValue(undefined);
const mockOverturn = jest.fn().mockResolvedValue(undefined);
const mockReconcile = jest.fn().mockResolvedValue(undefined);
let mockPractice = false;
jest.mock("../services/protocolRunner", () => ({
  runner: {
    send: (...a: unknown[]) => mockSend(...a),
    resolveChallenge: jest.fn(),
    holdSirenForCancel: jest.fn(),
    resumeSirenAfterCancel: jest.fn(),
    isPractice: () => mockPractice,
    verifySafeWord: jest.fn().mockResolvedValue(true),
    adoptOverturn: (...a: unknown[]) => mockOverturn(...a),
    reconcile: (...a: unknown[]) => mockReconcile(...a),
  },
}));
const mockPost = jest.fn();
jest.mock("../lib/api", () => ({ post: (...a: unknown[]) => mockPost(...a), get: jest.fn() }));
let mockRow: Record<string, unknown> | null = null;
let mockOffline = false;
jest.mock("../lib/supabase", () => {
  const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: async () => { if (mockOffline) throw new TypeError("Network request failed"); return { data: mockRow }; }, head: () => q };
  return {
    supabase: {
      from: () => q,
      auth: { getSession: async () => ({ data: { session: null } }) },
      channel: () => ({ on: () => ({ subscribe: () => {} }) }),
      removeChannel: () => {},
    },
  };
});
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-camera", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return { CameraView: React2.forwardRef((p: Record<string, unknown>, _r: unknown) => React2.createElement(View, { testID: p.testID })), useCameraPermissions: () => [{ granted: true }, jest.fn()] };
});
jest.mock("../services/gates", () => ({ gates: { verifyPassword: jest.fn() } }));
jest.mock("../services/appPassword", () => ({ resolveAccountEmail: jest.fn().mockResolvedValue("") }));

import { CancelWaitingNotice } from "../components/CancelWaitingNotice";
import { EmergencyOverlay } from "../components/EmergencyOverlay";
import { SilentAlarmOverlay } from "../components/SilentAlarmOverlay";
import { makeCancelFlowDeps } from "../services/cancelFlowDeps";
import { cancelWatchTick } from "../services/cancelWatch";
import { cadenceMs } from "../services/camera";
import { cancelOfflineMarker } from "../services/cancelOfflineMarker";
import { eventOutbox } from "../services/eventOutbox";
import AsyncStorage from "@react-native-async-storage/async-storage";

const J = { id: "j1", owner_id: "o1" };
const criticalCtx = (mode: "siren" | "silent" = "siren") => ({ ...initialContext(), state: "CRITICAL" as const, alarmMode: mode });
const waitingCtx = (mode: "siren" | "silent" = "siren") => transition(criticalCtx(mode), { type: "CANCEL_REQUESTED", method: "word" }).ctx;
const mount = async (el: React.ReactElement) => {
  const u = await render(<ThemeProvider>{el}</ThemeProvider>);
  await act(async () => {});
  return u;
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  eventOutbox.resetForTest();
  mockPractice = false;
  mockRow = null;
  mockOffline = false;
  mockPost.mockReset();
  useJourney.setState({ journey: null, ctx: initialContext(), cancelOffline: false, cancelNoGuardian: false, cancelApproved: false });
});
afterEach(async () => { await act(async () => { useJourney.setState({ journey: null, ctx: initialContext() }); }); });

test.each(["siren", "silent"] as const)("G2: while waiting (%s) neither alarm screen shows and the message does", async (mode) => {
  await act(async () => { useJourney.setState({ journey: J, ctx: waitingCtx(mode) }); });
  const el = await mount(<><EmergencyOverlay /><SilentAlarmOverlay /><CancelWaitingNotice /></>);
  expect(el.queryByTestId("silent-title")).toBeNull();
  expect(el.queryByTestId("cancel-exit")).toBeNull();
  expect(el.queryByText(/Not an emergency/i)).toBeNull();
  expect(el.getByTestId("cancel-waiting-text")).toHaveTextContent("Still checking with your guardian");
});

test("G2: the same CRITICAL without a request still shows the alarm screen and no message", async () => {
  await act(async () => { useJourney.setState({ journey: J, ctx: criticalCtx("silent") }); });
  const el = await mount(<><SilentAlarmOverlay /><CancelWaitingNotice /></>);
  expect(el.getByTestId("silent-title")).toBeTruthy();
  expect(el.queryByTestId("cancel-waiting-notice")).toBeNull();
});

test("D3-1 no question on her screen, whatever the row says", async () => {
  mockRow = { verdict: null, asked_contact_ids: ["c1"] };
  await act(async () => { useJourney.setState({ journey: J, ctx: waitingCtx() }); });
  const el = await mount(<CancelWaitingNotice />);
  await act(async () => { await cancelWatchTick("j1"); });
  expect(el.queryByTestId("cancel-next-question")).toBeNull();
  expect(el.getByTestId("cancel-waiting-text")).toHaveTextContent("Still checking with your guardian");
});

test("D3-1 the wording is gone in all three languages", () => {
  for (const lang of ["en", "hi", "kn"]) {
    const t = require(`../i18n/${lang}.json`);
    expect(t["cancelWait.nextQuestion"]).toBeUndefined();
    expect(t["cancelWait.yes"]).toBeUndefined();
    expect(t["cancelWait.no"]).toBeUndefined();
    expect(t["cancelWait.noGuardian"]).toBeTruthy();
    expect(t["photoCleanup.title"]).toBeTruthy();
  }
});

test("D3-2 nobody can be asked: normal screen, the message, no siren screen, alarm still on", async () => {
  mockRow = { verdict: null, asked_contact_ids: [] };
  await act(async () => { useJourney.setState({ journey: J, ctx: waitingCtx() }); });
  const el = await mount(<CancelWaitingNotice />);
  await act(async () => { await cancelWatchTick("j1"); });
  expect(el.getByTestId("cancel-waiting-text")).toHaveTextContent("No guardian can be reached right now.");
  expect(useJourney.getState().ctx.state).toBe("CRITICAL");
  mockRow = { verdict: null, asked_contact_ids: ["c1"] };
  await act(async () => { await cancelWatchTick("j1"); });
  expect(el.getByTestId("cancel-waiting-text")).toHaveTextContent("Still checking with your guardian");
});

test("D3-2 the server says nobody was asked: the message shows at once", async () => {
  useJourney.setState({ journey: J, ctx: criticalCtx() });
  mockPost.mockResolvedValueOnce({ requestId: "r1", asked: [] });
  await makeCancelFlowDeps().createRequest("word");
  expect(useJourney.getState().cancelNoGuardian).toBe(true);
});

test.each(["siren", "silent"] as const)("D3-5 after the emergency word (%s): no alarm screen, her card does not change", async (mode) => {
  const quiet = transition(waitingCtx(mode), { type: "KEYWORD", kind: "emergency" }).ctx;
  await act(async () => { useJourney.setState({ journey: J, ctx: quiet }); });
  const notice = await mount(<CancelWaitingNotice />);
  expect(notice.getByTestId("cancel-waiting-text")).toHaveTextContent("Still checking with your guardian");
  const e = await mount(<EmergencyOverlay />);
  expect(e.queryByTestId("emergency-overlay")).toBeNull();
  const s = await mount(<SilentAlarmOverlay />);
  expect(s.queryByTestId("silent-alarm")).toBeNull();
});

test("the guardian verdict reaches the runner with no screen open: Safe ends it, keep brings the alarm back", async () => {
  mockRow = { verdict: "cancel" };
  await act(async () => { useJourney.setState({ journey: J, ctx: waitingCtx() }); });
  expect(mockSend).toHaveBeenCalledWith({ type: "GUARDIAN_VOTE", safe: true, contactId: "" });
  await act(async () => { useJourney.setState({ journey: null, ctx: initialContext() }); });
  mockSend.mockClear();
  mockRow = { verdict: "keep" };
  await act(async () => { useJourney.setState({ journey: J, ctx: waitingCtx() }); });
  expect(mockSend).toHaveBeenCalledWith({ type: "GUARDIAN_SAYS_WRONG" });
});

test("G8: correct word with no network gives the honest message and takes the alarm off her screen", async () => {
  useJourney.setState({ journey: J, ctx: criticalCtx() });
  mockPost.mockRejectedValue(new TypeError("Network request failed"));
  await expect(makeCancelFlowDeps().createRequest("word")).resolves.toEqual({ askedCount: 0 });
  expect(useJourney.getState().cancelOffline).toBe(true);
  expect(mockSend).toHaveBeenCalledWith({ type: "CANCEL_REQUESTED", method: "word" });
  await act(async () => { useJourney.setState({ ctx: waitingCtx() }); });
  expect(useJourney.getState().cancelOffline).toBe(true);
  const el = await mount(<CancelWaitingNotice />);
  expect(el.getByTestId("cancel-waiting-text")).toHaveTextContent(/No network/);
});

test("G8: retries wait for the network, then send the same request once, even after expiry", async () => {
  mockPost.mockRejectedValue(new TypeError("Network request failed"));
  await act(async () => { useJourney.setState({ journey: J, ctx: waitingCtx(), cancelOffline: true }); });
  await act(async () => { await cancelWatchTick("j1"); });
  await act(async () => { await cancelWatchTick("j1"); });
  expect(useJourney.getState().cancelOffline).toBe(true);
  mockPost.mockReset();
  mockPost.mockResolvedValue({ requestId: "r1", asked: [] });
  await act(async () => { await cancelWatchTick("j1"); });
  expect(mockPost).toHaveBeenCalledWith("/api/cancel-request", { journeyId: "j1", method: "word", alarmMode: "siren" });
  expect(useJourney.getState().cancelOffline).toBe(false);
});

test("G8: a server refusal (409) ends the wait and the alarm returns", async () => {
  mockPost.mockRejectedValue(new Error("/api/cancel-request 409"));
  await act(async () => { useJourney.setState({ journey: J, ctx: waitingCtx(), cancelOffline: true }); });
  expect(mockSend).toHaveBeenCalledWith({ type: "GUARDIAN_SAYS_WRONG" });
});

test("G8: server errors are not treated as offline; the photo path offline is unchanged", async () => {
  useJourney.setState({ journey: J, ctx: criticalCtx() });
  mockPost.mockRejectedValue(new Error("/api/cancel-request 500"));
  await expect(makeCancelFlowDeps().createRequest("word")).rejects.toThrow("500");
  mockPost.mockRejectedValue(new TypeError("Network request failed"));
  await expect(makeCancelFlowDeps().createRequest("photo", "p")).rejects.toThrow("Network");
  expect(useJourney.getState().cancelOffline).toBe(false);
});

test("G8: photos stay at CRITICAL cadence while waiting (state is still CRITICAL)", () => {
  expect(waitingCtx().state).toBe("CRITICAL");
  expect(cadenceMs(waitingCtx().state)).toBe(60_000);
});

test("a drill never contacts a guardian: no watch, no post", async () => {
  mockPractice = true;
  await act(async () => { useJourney.setState({ journey: J, ctx: waitingCtx(), cancelOffline: true }); });
  await act(async () => {});
  expect(mockPost).not.toHaveBeenCalled();
});

// Fix lane R, M9: the offline word is written to the phone and rubbed out when it is over.
describe("offline marker", () => {
  const offlineWord = async () => {
    useJourney.getState().set({ journey: { ...J, alarm_mode: "silent" }, ctx: criticalCtx("silent") });
    mockPost.mockRejectedValueOnce(new Error("Network request failed"));
    await makeCancelFlowDeps().createRequest("word");
  };

  test("the word with no network saves the marker; delivery removes it", async () => {
    await offlineWord();
    expect(await cancelOfflineMarker.read()).toMatchObject({ id: "j1", owner_id: "o1", alarm_mode: "silent" });
    useJourney.getState().set({ cancelOffline: true });
    mockPost.mockResolvedValueOnce({ requestId: "r1", asked: [] });
    await cancelWatchTick("j1");
    expect(await cancelOfflineMarker.read()).toBeNull();
  });

  test("still no network on the retry: the marker stays", async () => {
    await offlineWord();
    useJourney.getState().set({ cancelOffline: true });
    mockPost.mockRejectedValueOnce(new Error("Network request failed"));
    await cancelWatchTick("j1");
    expect(await cancelOfflineMarker.read()).not.toBeNull();
  });

  test("the server refuses (409): the marker goes", async () => {
    await offlineWord();
    useJourney.getState().set({ cancelOffline: true });
    mockPost.mockRejectedValueOnce(new Error("/api/cancel-request 409"));
    await cancelWatchTick("j1");
    expect(await cancelOfflineMarker.read()).toBeNull();
  });

  test("online: nothing is saved", async () => {
    useJourney.getState().set({ journey: J, ctx: criticalCtx() });
    mockPost.mockResolvedValueOnce({ requestId: "r1", asked: [] });
    await makeCancelFlowDeps().createRequest("word");
    expect(await cancelOfflineMarker.read()).toBeNull();
  });
});

describe("D4 status icon (founder Q120, Q121)", () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });
  const pass = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
  const waitingNotice = async () => {
    await act(async () => { useJourney.setState({ journey: J, ctx: waitingCtx() }); });
    return mount(<CancelWaitingNotice />);
  };

  test("box shows with the icon; at 3 s the box goes and the icon stays; tap reopens; cross closes", async () => {
    const el = await waitingNotice();
    expect(el.getByTestId("cancel-waiting-text")).toHaveTextContent("Still checking with your guardian");
    expect(el.getByTestId("cancel-status-icon")).toBeTruthy();
    await pass(2900);
    expect(el.queryByTestId("cancel-status-box")).toBeTruthy();
    await pass(100);
    expect(el.queryByTestId("cancel-status-box")).toBeNull();
    expect(el.getByTestId("cancel-status-icon")).toBeTruthy();
    await act(async () => { fireEvent.press(el.getByTestId("cancel-status-icon")); });
    expect(el.getByTestId("cancel-waiting-text")).toHaveTextContent("Still checking with your guardian");
    await act(async () => { fireEvent.press(el.getByTestId("cancel-status-close")); });
    expect(el.queryByTestId("cancel-status-box")).toBeNull();
    expect(el.getByTestId("cancel-status-icon")).toBeTruthy();
  });

  test("Q121 guardian approves: the box opens at once and the icon goes at that same moment; gone at 3 s", async () => {
    const el = await waitingNotice();
    await pass(3000); // the first box has gone, only the icon is left
    expect(el.queryByTestId("cancel-status-box")).toBeNull();
    mockRow = { verdict: "cancel" };
    await act(async () => { await cancelWatchTick("j1"); });
    expect(el.getByTestId("cancel-waiting-text")).toHaveTextContent("Your guardian approved");
    expect(el.queryByTestId("cancel-status-icon")).toBeNull();
    expect(mockSend).toHaveBeenCalledWith({ type: "GUARDIAN_VOTE", safe: true, contactId: "" });
    await act(async () => { useJourney.setState({ ctx: { ...initialContext(), state: "RESOLVED_MONITORING" } }); });
    expect(el.getByTestId("cancel-waiting-text")).toHaveTextContent("Your guardian approved");
    await pass(3000);
    expect(el.queryByTestId("cancel-waiting-notice")).toBeNull();
    expect(useJourney.getState().cancelApproved).toBe(false);
  });

  test("Q121 the approval box also closes by its cross", async () => {
    mockRow = { verdict: "cancel" };
    const el = await waitingNotice();
    await act(async () => { await cancelWatchTick("j1"); });
    await act(async () => { useJourney.setState({ ctx: { ...initialContext(), state: "RESOLVED_MONITORING" } }); });
    await act(async () => { fireEvent.press(el.getByTestId("cancel-status-close")); });
    expect(el.queryByTestId("cancel-waiting-notice")).toBeNull();
  });

  test("the same box carries the no-network and no-guardian messages, and shows again when the message changes", async () => {
    const el = await waitingNotice();
    await pass(3000);
    await act(async () => { useJourney.setState({ cancelNoGuardian: true }); });
    expect(el.getByTestId("cancel-waiting-text")).toHaveTextContent("No guardian can be reached right now.");
    await pass(3000);
    await act(async () => { useJourney.setState({ cancelOffline: true }); });
    expect(el.getByTestId("cancel-waiting-text")).toHaveTextContent(/No network/);
  });

  test("the approval wording is in all three languages", () => {
    for (const lang of ["en", "hi", "kn"]) expect(require(`../i18n/${lang}.json`)["cancelWait.approved"]).toBeTruthy();
  });

  test("M6 after a Safe the phone hears of an overturn on the same cadence, once", async () => {
    mockRow = { verdict: "cancel" };
    await act(async () => { useJourney.setState({ journey: J, ctx: { ...initialContext(), state: "RESOLVED_MONITORING", heightened: true } }); });
    await pass(15_000);
    expect(mockOverturn).not.toHaveBeenCalled();
    mockRow = { verdict: "reraise" };
    await pass(15_000);
    expect(mockOverturn).toHaveBeenCalledTimes(1);
    await pass(15_000);
    expect(mockOverturn).toHaveBeenCalledTimes(1);
  });

  test("a close with no verdict does not leave her phone waiting", async () => {
    mockRow = { verdict: null, resolved_at: "2026-11-07T00:00:00Z", asked_contact_ids: ["c1"] };
    await act(async () => { useJourney.setState({ journey: J, ctx: waitingCtx("silent") }); });
    await act(async () => { await cancelWatchTick("j1"); });
    expect(mockSend).toHaveBeenCalledWith({ type: "GUARDIAN_SAYS_WRONG" });
    expect(mockReconcile).toHaveBeenCalled();
  });

  test("an open row with no verdict changes nothing", async () => {
    mockRow = { verdict: null, resolved_at: null, asked_contact_ids: ["c1"] };
    await act(async () => { useJourney.setState({ journey: J, ctx: waitingCtx() }); });
    await act(async () => { await cancelWatchTick("j1"); });
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("D4 H2 the true alarm mode", () => {
  test.each(["online", "offline"])("%s: a silent alarm whose journey row still says siren is sent, and saved, as silent", async (net) => {
    useJourney.setState({ journey: { ...J, alarm_mode: "siren" }, ctx: criticalCtx("silent") });
    if (net === "online") mockPost.mockResolvedValueOnce({ requestId: "r1", asked: ["c1"] });
    else mockPost.mockRejectedValue(new TypeError("Network request failed"));
    await makeCancelFlowDeps().createRequest("word");
    expect(mockPost.mock.calls[0][1]).toMatchObject({ alarmMode: "silent" });
    if (net === "offline") {
      expect((await cancelOfflineMarker.read())?.alarm_mode).toBe("silent");
      expect(await eventOutbox.pending()).toBe(1);
    }
  });

  test("something still owed to the server: the word queues behind it instead of overtaking", async () => {
    useJourney.setState({ journey: J, ctx: criticalCtx("silent") });
    await eventOutbox.add({ journeyId: "j1", kind: "event", event: { type: "SOS", mode: "silent" } });
    await expect(makeCancelFlowDeps().createRequest("word")).resolves.toEqual({ askedCount: 0 });
    expect(mockPost).not.toHaveBeenCalled();
    expect(await eventOutbox.pending()).toBe(2);
  });
});

describe("D5 a guardian ends the quiet alarm after the emergency word (founder Q125)", () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });
  const pass = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
  const quietCtx = () => transition(waitingCtx("silent"), { type: "KEYWORD", kind: "emergency" }).ctx;
  const VOTE = { type: "GUARDIAN_VOTE", safe: true, contactId: "" };

  test("while the row says distress her phone changes nothing; when a guardian ends it the icon goes and the box opens at once", async () => {
    expect(quietCtx().quietAlarm).toBe(true);
    mockRow = { verdict: "distress", resolved_at: "2026-11-08T00:00:00Z", asked_contact_ids: [] };
    await act(async () => { useJourney.setState({ journey: J, ctx: quietCtx() }); });
    const el = await mount(<CancelWaitingNotice />);
    await pass(15_000);
    expect(mockSend).not.toHaveBeenCalled();
    expect(useJourney.getState().cancelNoGuardian).toBe(false); // an empty asked list on a closed row says nothing
    expect(el.getByTestId("cancel-status-icon")).toBeTruthy();
    await pass(3000);
    mockRow = { ...mockRow, verdict: "cancel" };
    await pass(15_000);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(VOTE);
    expect(el.queryByTestId("cancel-status-icon")).toBeNull();
    expect(el.getByTestId("cancel-waiting-text")).toHaveTextContent("Your guardian approved");
    await pass(15_000);
    expect(mockSend).toHaveBeenCalledTimes(1); // once
  });

  test("her phone ends the alarm on the same path as an approved Safe: siren stays off, alarm photos stop, the box closes at 3 s", async () => {
    mockRow = { verdict: "cancel", resolved_at: "2026-11-08T00:00:00Z" };
    await act(async () => { useJourney.setState({ journey: J, ctx: quietCtx() }); });
    const el = await mount(<CancelWaitingNotice />);
    expect(mockSend).toHaveBeenCalledWith(VOTE);
    // What the real runner does with that event, from the context the watch left.
    const r = transition(useJourney.getState().ctx, VOTE as never);
    expect(r.ctx.state).toBe("RESOLVED_MONITORING");
    expect(r.ctx.quietAlarm).toBeUndefined();
    expect(r.actions).toContain("SIREN_OFF");
    expect(r.actions).not.toContain("SIREN_ON");
    expect(["EMERGENCY", "CRITICAL", "CANCEL_HOLD"]).not.toContain(r.ctx.state); // camera.ts saves alarm photos only in these
    await act(async () => { useJourney.setState({ ctx: r.ctx }); });
    expect(el.getByTestId("cancel-waiting-text")).toHaveTextContent("Your guardian approved");
    await pass(3000);
    expect(el.queryByTestId("cancel-waiting-notice")).toBeNull();
  });

  test("the quiet marker goes, so a restart cannot bring the quiet alarm back", async () => {
    await cancelOfflineMarker.save({ id: "j1", owner_id: "o1", alarm_mode: "silent", quiet: true });
    mockRow = { verdict: "cancel", resolved_at: "2026-11-08T00:00:00Z" };
    await act(async () => { useJourney.setState({ journey: J, ctx: quietCtx() }); });
    await pass(0);
    expect(await cancelOfflineMarker.read()).toBeNull();
  });

  test("after a restart while quiet (adopted quiet), the watch runs and learns of the end", async () => {
    mockRow = { verdict: "distress", resolved_at: "2026-11-08T00:00:00Z" };
    await act(async () => { useJourney.setState({ journey: J, ctx: { ...initialContext(), state: "CRITICAL", alarmMode: "silent", quietAlarm: true } }); });
    await pass(15_000);
    expect(mockSend).not.toHaveBeenCalled();
    mockRow = { verdict: "cancel", resolved_at: "2026-11-08T00:00:00Z" };
    await pass(15_000);
    expect(mockSend).toHaveBeenCalledWith(VOTE);
    expect(useJourney.getState().cancelApproved).toBe(true);
  });

  test("offline when it happens: nothing changes until the network is back, then the end arrives once", async () => {
    mockOffline = true;
    mockRow = { verdict: "cancel", resolved_at: "2026-11-08T00:00:00Z" };
    await act(async () => { useJourney.setState({ journey: J, ctx: quietCtx() }); });
    await pass(45_000);
    expect(mockSend).not.toHaveBeenCalled();
    expect(useJourney.getState().ctx.quietAlarm).toBe(true);
    mockOffline = false;
    await pass(15_000);
    await pass(15_000);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("a later keep or an open row does not end a quiet alarm", async () => {
    for (const verdict of ["keep", "reraise", "pending", null]) {
      mockRow = { verdict, resolved_at: null, asked_contact_ids: [] };
      await act(async () => { useJourney.setState({ journey: J, ctx: quietCtx() }); });
      await pass(15_000);
      await act(async () => { useJourney.setState({ journey: null, ctx: initialContext() }); });
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("a drill never watches", async () => {
    mockPractice = true;
    mockRow = { verdict: "cancel" };
    await act(async () => { useJourney.setState({ journey: J, ctx: quietCtx() }); });
    await pass(15_000);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
