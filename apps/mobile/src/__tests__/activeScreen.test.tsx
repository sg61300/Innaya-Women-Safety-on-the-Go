import { render, act, fireEvent } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";

// ---- runner (mocked: the screen only sends events / reads the store) ----
const mockSend = jest.fn();
const mockTick = jest.fn();
jest.mock("../services/protocolRunner", () => ({
  runner: { send: (...a: unknown[]) => mockSend(...a), tick: (...a: unknown[]) => mockTick(...a) },
}));

// ---- router ----
const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ navigate: (...a: unknown[]) => mockNavigate(...a) }) }));

// ---- native maps ----
jest.mock("react-native-maps", () => {
  const R = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: (p: any) => R.createElement(View, { testID: p.testID }, p.children),
    Polyline: (p: any) => R.createElement(View, { testID: p.testID }),
    Marker: (p: any) => R.createElement(View, { testID: p.testID }),
  };
});

// ---- expo modules ----
jest.mock("expo-keep-awake", () => ({ useKeepAwake: jest.fn() }));
const mockSetString = jest.fn().mockResolvedValue(undefined);
jest.mock("expo-clipboard", () => ({ setStringAsync: (...a: unknown[]) => mockSetString(...a) }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: "l", Medium: "m" } }));
jest.mock("expo-location", () => ({})); // watch effect degrades to no-op
jest.mock("expo-camera", () => {
  const R = require("react");
  const { View } = require("react-native");
  return { CameraView: R.forwardRef((p: any, _ref: any) => R.createElement(View, { testID: p.testID })) };
});

// ---- supabase (guardians query) ----
const mockGuardianRows = { data: [{ contact_id: "c1", contacts: { name: "Asha" } }] as any[] };
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: "tok" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ eq: async () => mockGuardianRows }) }) }),
  },
}));
jest.mock("../lib/events", () => ({ events: { log: jest.fn() } }));

import JourneyActiveScreen from "../../app/(user)/journey/active";
import { useJourney } from "../store/journey";
import { initialContext } from "@vaira/core";

const seed = (over: Record<string, unknown> = {}, ctx: Partial<ReturnType<typeof initialContext>> = {}) =>
  useJourney.getState().set({
    journey: { id: "j1", from_label: "Home", to_label: "Work", from_lat: 12.9, from_lng: 77.5, to_lat: 12.95, to_lng: 77.6, eta_seconds: 1200, mode: "cab", start_at: new Date().toISOString(), danger_zone: false, ...over },
    ctx: { ...initialContext(), ...ctx },
    sensors: { mic: true, cam: true, gps: true, ble: false },
    challenge: null,
  });

const mount = async () => {
  const utils = await render(
    <ThemeProvider>
      <JourneyActiveScreen />
    </ThemeProvider>
  );
  await act(async () => {});
  return utils;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGuardianRows.data = [{ contact_id: "c1", contacts: { name: "Asha" } }];
});

test("mounts the map, route, header, chips, sensor pills and actions", async () => {
  seed();
  const { getByTestId } = await mount();
  for (const id of [
    "active-screen",
    "active-map",
    "active-route",
    "active-header",
    "active-monitoring-chip",
    "active-camera-pill",
    "sensor-pill-voice",
    "sensor-pill-gps",
    "active-transport",
    "active-arrived",
    "active-changeplan",
    "active-sharelink",
    // hidden-camera moved to (user)/_layout (D12): mounted once for the whole
    // journey, not per-screen. See ActiveJourneyCamera.test.tsx.
    "active-recording",
    "active-camera-toggle",
    "active-cadence-info",
  ]) {
    expect(getByTestId(id)).toBeTruthy();
  }
});

test("cadence popup dismisses and visible camera control uses pause/resume flow", async () => {
  seed();
  const { getByTestId, queryByTestId } = await mount();
  await act(async () => fireEvent.press(getByTestId("active-cadence-dismiss")));
  expect(queryByTestId("active-cadence-info")).toBeNull();
  await act(async () => fireEvent.press(getByTestId("active-camera-toggle")));
  expect(mockSend).toHaveBeenCalledWith({ type: "SENSOR_PAUSE_REQUEST", sensor: "cam" });
  await act(async () => {
    useJourney.getState().set({ ctx: { ...useJourney.getState().ctx, cameraPaused: true } });
  });
  await act(async () => fireEvent.press(getByTestId("active-camera-toggle")));
  expect(mockSend).toHaveBeenCalledWith({ type: "SENSOR_RESUME", sensor: "cam" });
});

test("lite mode → camera pill shows the battery %", async () => {
  seed();
  useJourney.getState().set({ lite: true, battery: 15 });
  const { getByText } = await mount();
  expect(getByText("Lite mode · 15%")).toBeTruthy();
});

test("I've arrived sends END", async () => {
  seed();
  const { getByTestId } = await mount();
  await act(async () => fireEvent.press(getByTestId("active-arrived")));
  expect(mockSend).toHaveBeenCalledWith({ type: "END" });
});

test("Change plan sends PLAN_CHANGE then navigates to edit", async () => {
  seed();
  const { getByTestId } = await mount();
  await act(async () => fireEvent.press(getByTestId("active-changeplan")));
  expect(mockSend).toHaveBeenCalledWith({ type: "PLAN_CHANGE" });
  expect(mockNavigate).toHaveBeenCalledWith("/(user)/journey/new?edit=1");
});

test("Share live link GETs the api and copies the url to the clipboard", async () => {
  seed();
  const spy = jest.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ url: "https://vaira.app/g/tok" }) } as any);
  const { getByTestId } = await mount();
  await act(async () => fireEvent.press(getByTestId("active-sharelink")));
  expect(spy).toHaveBeenCalledWith(expect.stringContaining("/api/guardian-link?journeyId=j1"), expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer tok" }) }));
  expect(mockSetString).toHaveBeenCalledWith("https://vaira.app/g/tok");
  spy.mockRestore();
});

test("camera pill: hold requests a pause; tap while paused resumes", async () => {
  seed({}, { cameraPaused: true });
  const { getByTestId } = await mount();
  await act(async () => fireEvent(getByTestId("active-camera-pill"), "longPress"));
  expect(mockSend).toHaveBeenCalledWith({ type: "SENSOR_PAUSE_REQUEST", sensor: "cam" });
  await act(async () => fireEvent.press(getByTestId("active-camera-pill")));
  expect(mockSend).toHaveBeenCalledWith({ type: "SENSOR_RESUME", sensor: "cam" });
});

test("monitoring chip shows the active guardian count and opens the sheet", async () => {
  seed();
  const { getByTestId } = await mount();
  await act(async () => fireEvent.press(getByTestId("active-monitoring-chip")));
  expect(getByTestId("active-guardian-c1")).toBeTruthy();
});

test("heightened context shows the 'watching closely' chip", async () => {
  seed({}, { heightened: true });
  const { getByTestId } = await mount();
  expect(getByTestId("active-heightened-chip")).toBeTruthy();
});
