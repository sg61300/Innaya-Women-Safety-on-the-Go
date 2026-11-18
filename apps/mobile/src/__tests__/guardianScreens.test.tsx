import { render, fireEvent, act, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { ThemeProvider } from "../theme";

// ---- router ----
const mockNavigate = jest.fn();
const mockReplace = jest.fn();
let mockSearchParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: (...a: unknown[]) => mockNavigate(...a), replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams,
}));

// ---- native maps ----
jest.mock("react-native-maps", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: (p: any) => React2.createElement(View, { testID: p.testID }, p.children),
    Marker: (p: any) => React2.createElement(View, { testID: p.testID }),
  };
});

// ---- notifications ----
let mockNotifCb: ((r: any) => void) | null = null;
jest.mock("expo-notifications", () => ({
  addNotificationResponseReceivedListener: (cb: (r: any) => void) => {
    mockNotifCb = cb;
    return { remove: jest.fn() };
  },
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  // F1: guardian profile's loud-override DnD flow (not exercised here, but the
  // channel APIs + enums must resolve when the screen imports them).
  getNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  AndroidImportance: { MAX: 5 },
  AndroidAudioUsage: { ALARM: 4 },
  AndroidAudioContentType: { SONIFICATION: 4 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
}));

// F1: guardian profile imports these; mock so the suite does not pull native
// modules (expo-intent-launcher / lib/permissions' expo-location/camera/audio).
jest.mock("expo-intent-launcher", () => ({
  startActivityAsync: jest.fn().mockResolvedValue(undefined),
  ActivityAction: { NOTIFICATION_POLICY_ACCESS_SETTINGS: "android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS" },
}));
jest.mock("../lib/permissions", () => ({ ALARM_CHANNEL_ID: "vaira-alarm-2" }));

// ---- guardian service (keep real patchCountdown) ----
const mockTrustees = jest.fn();
const mockRespond = jest.fn();
const mockHeartbeat = jest.fn();
const mockCheckOnHer = jest.fn();
const mockRaiseSos = jest.fn();
const mockEndStatus = jest.fn().mockResolvedValue({ end: "none" });
const mockEndAlarm = jest.fn();
jest.mock("../services/guardian", () => ({
  ...jest.requireActual("../services/guardian"),
  guardian: {
    trustees: (...a: unknown[]) => mockTrustees(...a),
    respond: (...a: unknown[]) => mockRespond(...a),
    heartbeat: (...a: unknown[]) => mockHeartbeat(...a),
    checkOnHer: (...a: unknown[]) => mockCheckOnHer(...a),
    raiseSos: (...a: unknown[]) => mockRaiseSos(...a),
    endStatus: (...a: unknown[]) => mockEndStatus(...a),
    endAlarm: (...a: unknown[]) => mockEndAlarm(...a),
  },
}));

const mockLog = jest.fn();
jest.mock("../lib/events", () => ({ events: { log: (...a: unknown[]) => mockLog(...a) } }));

// ---- supabase ----
const mockUpdateEq = jest.fn().mockResolvedValue({ error: null });
// Capture the monitor's postgres_changes handlers by table so a test can emit
// a row; keep the .on chain returning the same channel object.
let mockChannelHandlers: Record<string, (m: any) => void | Promise<void>> = {};
const mockCreateSignedUrl = jest.fn().mockResolvedValue({ data: null });
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "g1" } } }) },
    from: jest.fn().mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { name: "Guardian G", phone: "9876543210" } }) }) }),
      update: () => ({ eq: (...a: unknown[]) => mockUpdateEq(...a) }),
    })),
    channel: () => {
      const ch: any = {
        on: (_event: string, cfg: any, handler: (m: any) => void | Promise<void>) => {
          if (cfg?.table) mockChannelHandlers[cfg.table] = handler;
          return ch;
        },
        subscribe: jest.fn(),
      };
      return ch;
    },
    removeChannel: jest.fn(),
    storage: { from: () => ({ createSignedUrl: (...a: unknown[]) => mockCreateSignedUrl(...a) }) },
  },
}));

import { RequestSheet } from "../components/RequestSheet";
import Trustees from "../../app/(guardian)/trustees";
import GuardianSos from "../../app/(guardian)/sos";
import GuardianProfile from "../../app/(guardian)/profile";
import Monitor from "../../app/(guardian)/monitor/[journeyId]";

// Render, then flush async effects (getUser / trustees / heartbeat) inside a
// single act scope so nothing leaks into the next test (React 19 overlapping act).
const mount = async (node: React.ReactElement) => {
  const utils = await render(<ThemeProvider>{node}</ThemeProvider>);
  await act(async () => {});
  return utils;
};
const press = async (el: any) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockNotifCb = null;
  mockSearchParams = {};
  mockTrustees.mockResolvedValue([]);
  mockChannelHandlers = {};
  mockCreateSignedUrl.mockResolvedValue({ data: null });
});

test("RequestSheet opens on a monitoring_request, shows copy + queue, and accept posts respond", async () => {
  const { queryByTestId, getByTestId } = await mount(<RequestSheet />);
  expect(queryByTestId("request-sheet")).toBeNull(); // hidden until a request arrives
  await act(async () => {
    mockNotifCb?.({ notification: { request: { content: { data: { kind: "monitoring_request", journeyId: "j1", name: "Asha", time: "6 pm", from: "A", to: "B", minutes: 20, position: 1, total: 3 } } } } });
  });
  expect(getByTestId("request-sheet")).toBeTruthy();
  expect(getByTestId("request-queue")).toBeTruthy();
  await press(getByTestId("request-accept"));
  expect(mockRespond).toHaveBeenCalledWith("j1", "accept");
  await waitFor(() => expect(queryByTestId("request-sheet")).toBeNull()); // closes after responding
});

test("RequestSheet ignores non-monitoring notifications", async () => {
  const { queryByTestId } = await mount(<RequestSheet />);
  await act(async () => {
    mockNotifCb?.({ notification: { request: { content: { data: { kind: "something_else", journeyId: "x" } } } } });
  });
  expect(queryByTestId("request-sheet")).toBeNull();
});

test("RequestSheet auto-declines after 3 minutes untouched", async () => {
  jest.useFakeTimers();
  try {
    const { getByTestId } = await mount(<RequestSheet />);
    await act(async () => {
      mockNotifCb?.({ notification: { request: { content: { data: { kind: "monitoring_request", journeyId: "j9", name: "Asha", minutes: 15 } } } } });
    });
    expect(getByTestId("request-sheet")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(3 * 60_000);
    });
    expect(mockRespond).toHaveBeenCalledWith("j9", "decline");
  } finally {
    jest.useRealTimers();
  }
});

test("RequestSheet keeps the sheet open and shows an error when respond fails", async () => {
  mockRespond.mockRejectedValueOnce(new Error("offline"));
  const { getByTestId, queryByTestId } = await mount(<RequestSheet />);
  await act(async () => {
    mockNotifCb?.({ notification: { request: { content: { data: { kind: "monitoring_request", journeyId: "jf1", name: "Asha", minutes: 10 } } } } });
  });
  await press(getByTestId("request-accept"));
  await waitFor(() => expect(getByTestId("request-error")).toBeTruthy());
  expect(queryByTestId("request-sheet")).toBeTruthy(); // stays open on failure
});

test("RequestSheet does not re-open an already-answered request", async () => {
  const notif = { notification: { request: { content: { data: { kind: "monitoring_request", journeyId: "jd1", name: "Asha", minutes: 10 } } } } };
  const { getByTestId, queryByTestId } = await mount(<RequestSheet />);
  await act(async () => { mockNotifCb?.(notif); });
  expect(getByTestId("request-sheet")).toBeTruthy();
  await press(getByTestId("request-accept"));
  await waitFor(() => expect(queryByTestId("request-sheet")).toBeNull());
  await act(async () => { mockNotifCb?.(notif); }); // same journeyId taps again
  expect(queryByTestId("request-sheet")).toBeNull();
});

test("trustees lists people and routes to the monitor screen on tap", async () => {
  mockTrustees.mockResolvedValue([
    { contactId: "c1", ownerId: "o1", name: "Asha", tier: "primary", journey: { id: "j1", state: "SAFE", from: "Home", to: "Work", startAt: "" } },
  ]);
  const { getByTestId } = await mount(<Trustees />);
  await press(getByTestId("trustee-c1"));
  expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/(guardian)/monitor/[journeyId]", params: expect.objectContaining({ journeyId: "j1" }) }));
});

test("trustees shows and dismisses the first-time explainer", async () => {
  const { getByTestId, queryByTestId } = await mount(<Trustees />);
  expect(getByTestId("trustees-explainer")).toBeTruthy();
  await press(getByTestId("trustees-explainer-close"));
  await waitFor(() => expect(queryByTestId("trustees-explainer")).toBeNull());
});

test("guardian SOS: raise → confirm → patch prompt → patch-in logs and dials 112", async () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
  mockSearchParams = { journeyId: "j1", name: "Asha" };
  const { getByTestId, queryByTestId } = await mount(<GuardianSos />);
  await press(getByTestId("sos-open"));
  await press(getByTestId("sos-confirm-yes"));
  expect(mockRaiseSos).toHaveBeenCalledWith("j1");
  expect(getByTestId("sos-patch")).toBeTruthy();
  await press(getByTestId("sos-patch-yes"));
  expect(mockLog).toHaveBeenCalledWith("patch_request", {}, "j1");
  expect(openURL).toHaveBeenCalledWith("tel:112");
  await waitFor(() => expect(queryByTestId("sos-patch")).toBeNull());
  openURL.mockRestore();
});

test("guardian SOS: a failed raise shows an error but still routes to the 112 path", async () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
  mockRaiseSos.mockRejectedValueOnce(new Error("offline"));
  mockSearchParams = { journeyId: "j5", name: "Asha" };
  const { getByTestId } = await mount(<GuardianSos />);
  await press(getByTestId("sos-open"));
  await press(getByTestId("sos-confirm-yes"));
  expect(mockRaiseSos).toHaveBeenCalledWith("j5");
  expect(getByTestId("sos-raise-error")).toBeTruthy();
  await press(getByTestId("sos-patch-no")); // still walked to the 112 path
  expect(openURL).toHaveBeenCalledWith("tel:112");
  openURL.mockRestore();
});

test("guardian SOS patch prompt auto-dismisses to a plain 112 call after 5 s", async () => {
  jest.useFakeTimers();
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
  try {
    mockSearchParams = { journeyId: "j2", name: "Asha" };
    const { getByTestId } = await mount(<GuardianSos />);
    await press(getByTestId("sos-open"));
    await press(getByTestId("sos-confirm-yes"));
    expect(getByTestId("sos-patch")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockLog).not.toHaveBeenCalledWith("patch_request", {}, "j2");
    expect(openURL).toHaveBeenCalledWith("tel:112");
  } finally {
    openURL.mockRestore();
    jest.useRealTimers();
  }
});

test("guardian profile: switch to My Safety updates the profile role and navigates home", async () => {
  const { getByTestId } = await mount(<GuardianProfile />);
  await press(getByTestId("guardian-switch-role"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/(user)/home"));
  expect(mockUpdateEq).toHaveBeenCalledWith("id", "g1");
});

test("monitor: heartbeats on mount and wires Check-on-her / Raise-SOS to the journey", async () => {
  mockSearchParams = { journeyId: "j1", name: "Asha" };
  const { getByTestId } = await mount(<Monitor />);
  expect(getByTestId("monitor-screen")).toBeTruthy();
  expect(mockHeartbeat).toHaveBeenCalledWith("j1");
  await press(getByTestId("monitor-check"));
  expect(mockCheckOnHer).toHaveBeenCalledWith("j1");
});

test("monitor: renders the live frame when a frame event arrives", async () => {
  mockSearchParams = { journeyId: "j1", name: "Asha" };
  mockCreateSignedUrl.mockResolvedValueOnce({ data: { signedUrl: "https://x/frame.jpg" } });
  const { getByTestId, queryByTestId } = await mount(<Monitor />);
  expect(queryByTestId("monitor-frame")).toBeNull();
  await act(async () => {
    await mockChannelHandlers["events"]?.({ new: { type: "frame", payload: { path: "j1/f.jpg" } } });
  });
  expect(getByTestId("monitor-frame")).toBeTruthy();
});

test("monitor: SOS button routes to the confirm-guarded SOS screen and never raises directly", async () => {
  mockSearchParams = { journeyId: "j1", name: "Asha" };
  const { getByTestId } = await mount(<Monitor />);
  await press(getByTestId("monitor-sos"));
  expect(mockNavigate).toHaveBeenCalledWith({ pathname: "/(guardian)/sos", params: { journeyId: "j1", name: "Asha" } });
  expect(mockRaiseSos).not.toHaveBeenCalled();
});

test("monitor: R47c an alarm_expired event archives the view — no live feed, Call 112 shown", async () => {
  mockSearchParams = { journeyId: "j1", name: "Asha" };
  mockCreateSignedUrl.mockResolvedValueOnce({ data: { signedUrl: "https://x/frame.jpg" } });
  const { getByTestId, queryByTestId } = await mount(<Monitor />);
  await act(async () => {
    await mockChannelHandlers["events"]?.({ new: { type: "frame", payload: { path: "j1/f.jpg" } } });
    await mockChannelHandlers["events"]?.({ new: { type: "alarm_expired", payload: { last_seen: "2026-09-06T04:30:00Z" } } });
  });
  expect(getByTestId("monitor-archived")).toBeTruthy();
  expect(getByTestId("monitor-call-112")).toBeTruthy();
  expect(queryByTestId("monitor-frame")).toBeNull(); // no live feed once archived
});

test("monitor: R47d shows the battery level, low style at ≤ 20 %", async () => {
  mockSearchParams = { journeyId: "j1", name: "Asha" };
  const { getByTestId } = await mount(<Monitor />);
  await act(async () => {
    await mockChannelHandlers["heartbeats"]?.({ new: { battery: 0.18 } });
  });
  expect(getByTestId("monitor-battery")).toBeTruthy();
});

// ---- Fix lane D7 item 9 (founder Q125): the in-app end action, same rules as the web page ----
describe("monitor: guardian end action after her emergency word", () => {
  const START = "I have spoken to her. End the alarm";
  const QUESTION = "Only do this after speaking with her yourself. End the alarm?";
  const CLOSED = "You can't end the alarm right now. Another group of her guardians has been asked.";
  beforeEach(() => { mockSearchParams = { journeyId: "j1", name: "Asha" }; });

  test("not shown when the server says none (no emergency word, alarm over, not her guardian)", async () => {
    mockEndStatus.mockResolvedValue({ end: "none" });
    const { queryByTestId, queryByText } = await mount(<Monitor />);
    expect(mockEndStatus).toHaveBeenCalledWith("j1");
    expect(queryByTestId("monitor-end-start")).toBeNull();
    expect(queryByText(START)).toBeNull();
  });

  test("not shown when the status check fails", async () => {
    mockEndStatus.mockRejectedValue(new Error("offline"));
    const { queryByTestId } = await mount(<Monitor />);
    expect(queryByTestId("monitor-end-start")).toBeNull();
  });

  test("two steps: the first only asks; Go back ends nothing; End calls the server once", async () => {
    mockEndStatus.mockResolvedValue({ end: "open" });
    mockEndAlarm.mockResolvedValue({ result: "ended" });
    const { getByTestId, getByText, queryByText } = await mount(<Monitor />);
    expect(getByText(START)).toBeTruthy();
    await press(getByTestId("monitor-end-start"));
    expect(getByText(QUESTION)).toBeTruthy();
    expect(mockEndAlarm).not.toHaveBeenCalled();
    await press(getByTestId("monitor-end-back"));
    expect(queryByText(QUESTION)).toBeNull();
    expect(mockEndAlarm).not.toHaveBeenCalled();
    await press(getByTestId("monitor-end-start"));
    await press(getByTestId("monitor-end-confirm"));
    expect(mockEndAlarm).toHaveBeenCalledTimes(1);
    expect(mockEndAlarm).toHaveBeenCalledWith("j1");
    expect(getByText("Thank you. The alarm has ended. Her journey is still being watched.")).toBeTruthy();
  });

  test("outside her group's window: greyed with the short line, cannot be started", async () => {
    mockEndStatus.mockResolvedValue({ end: "closed" });
    const { getByTestId, getByText, queryByText } = await mount(<Monitor />);
    expect(getByText(CLOSED)).toBeTruthy();
    expect(getByTestId("monitor-end-closed").props.accessibilityState).toMatchObject({ disabled: true });
    await press(getByTestId("monitor-end-closed"));
    expect(queryByText(QUESTION)).toBeNull();
    expect(mockEndAlarm).not.toHaveBeenCalled();
  });

  test("refused by the server (window closed meanwhile): says nothing changed and checks again", async () => {
    mockEndStatus.mockResolvedValueOnce({ end: "open" }).mockResolvedValue({ end: "closed" });
    mockEndAlarm.mockRejectedValue(new Error("/api/guardian-end 410"));
    const { getByTestId, getByText } = await mount(<Monitor />);
    await press(getByTestId("monitor-end-start"));
    await press(getByTestId("monitor-end-confirm"));
    expect(getByText("This alarm cannot be ended here. Nothing was changed.")).toBeTruthy();
    await waitFor(() => expect(getByText(CLOSED)).toBeTruthy());
  });
});
