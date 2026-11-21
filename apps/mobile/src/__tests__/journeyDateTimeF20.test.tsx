import { render, act, fireEvent } from "@testing-library/react-native";
import { Platform } from "react-native";
import { ThemeProvider } from "../theme";
import { useSession } from "../store/session";

// F20: on Android the community datetimepicker has no "datetime" mode, so the
// screen must run date then time as two dialogs. Capture the picker's props to
// drive the flow.
let mockPickerProps: Record<string, any> | null = null;
jest.mock("@react-native-community/datetimepicker", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return { __esModule: true, default: (p: Record<string, any>) => { mockPickerProps = p; return React2.createElement(View, { testID: p.testID }); } };
});

jest.mock("expo-router", () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), back: jest.fn() }), useNavigation: () => ({ addListener: () => () => {}, dispatch: jest.fn() }) }));
jest.mock("expo-camera", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return { CameraView: React2.forwardRef((p: Record<string, unknown>, _r: unknown) => React2.createElement(View, { testID: p.testID })), useCameraPermissions: () => [{ granted: true }, jest.fn()] };
});
jest.mock("expo-location", () => ({ requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), Accuracy: { Balanced: 3, Highest: 6 } }));
jest.mock("expo-battery", () => ({ getBatteryLevelAsync: () => Promise.resolve(0.8), BatteryState: { CHARGING: 2, FULL: 3 } }));
jest.mock("../lib/events", () => ({ events: { log: jest.fn(), flush: jest.fn() } }));
jest.mock("react-native-google-places-autocomplete", () => {
  const React2 = require("react");
  const { TextInput } = require("react-native");
  return { GooglePlacesAutocomplete: (p: Record<string, any>) => React2.createElement(TextInput, { ...(p.textInputProps ?? {}), placeholder: p.placeholder }) };
});
jest.mock("../services/journey", () => { const actual = jest.requireActual("../services/journey"); return { ...actual, createJourney: jest.fn() }; });
jest.mock("../services/secureWords", () => ({ secureWords: { get: jest.fn().mockResolvedValue([]), strength: () => "ok", save: jest.fn() } }));
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: "tok" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: jest.fn().mockResolvedValue({ data: { word_salt: "salt", id: "j1" } }), maybeSingle: jest.fn().mockResolvedValue({ data: null }) }) }) }),
  },
}));

import JourneyNewScreen from "../../app/(user)/journey/new";
// journey/new now carries intro-tour targets (TourTarget needs the provider).
import { TourProvider } from "../components/tour/TourProvider";

const renderScreen = async () => {
  useSession.setState({ userId: "u1" });
  let out: ReturnType<typeof render>;
  await act(async () => { out = render(<ThemeProvider><TourProvider><JourneyNewScreen /></TourProvider></ThemeProvider>); });
  return out!;
};

beforeEach(() => { mockPickerProps = null; (Platform as { OS: string }).OS = "android"; });

test("F20 Android: schedule runs date then time; the picker closes after time", async () => {
  const r = await renderScreen();
  await act(async () => { fireEvent.press(r.getByTestId("journey-schedule")); });
  // first dialog is the date step
  expect(mockPickerProps?.mode).toBe("date");
  const future = new Date(Date.now() + 3 * 24 * 3600 * 1000);
  await act(async () => { mockPickerProps!.onChange({ type: "set" }, future); });
  // after picking a date it switches to the time step, still visible
  expect(mockPickerProps?.mode).toBe("time");
  await act(async () => { mockPickerProps!.onChange({ type: "set" }, future); });
  // time chosen -> picker closes
  expect(r.queryByTestId("journey-datetime")).toBeNull();
  expect(r.queryByTestId("journey-past-time")).toBeNull();
});

test("F20 Android: dismissing the date dialog cancels without opening time", async () => {
  const r = await renderScreen();
  await act(async () => { fireEvent.press(r.getByTestId("journey-schedule")); });
  await act(async () => { mockPickerProps!.onChange({ type: "dismissed" }, undefined); });
  expect(r.queryByTestId("journey-datetime")).toBeNull();
});

test("F20: a past time is rejected and warned", async () => {
  const r = await renderScreen();
  await act(async () => { fireEvent.press(r.getByTestId("journey-schedule")); });
  const past = new Date(Date.now() - 3600 * 1000);
  await act(async () => { mockPickerProps!.onChange({ type: "set" }, past); });
  await act(async () => { mockPickerProps!.onChange({ type: "set" }, past); });
  expect(r.getByTestId("journey-past-time")).toBeTruthy();
});
