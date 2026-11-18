import React from "react";
import { render, act, fireEvent } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { useSession } from "../store/session";

// G5: "Use current location" was a silent no-op when precise location was
// unavailable (permission denied / no GPS). It must (a) request with high accuracy
// and (b) surface a visible error instead of doing nothing.

jest.mock("expo-router", () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), back: jest.fn() }), useNavigation: () => ({ addListener: () => () => {}, dispatch: jest.fn() }) }));
jest.mock("expo-camera", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return {
    CameraView: React2.forwardRef((p: Record<string, unknown>, _ref: unknown) => React2.createElement(View, { testID: p.testID })),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});

const mockRequestPerm = jest.fn().mockResolvedValue({ status: "denied" });
const mockGetPos = jest.fn().mockResolvedValue({ coords: { latitude: 12.97, longitude: 77.59 } });
const mockLastKnown = jest.fn().mockResolvedValue(null);
const mockServicesEnabled = jest.fn().mockResolvedValue(true);
const mockSetAddressText = jest.fn();
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: (...a: unknown[]) => mockRequestPerm(...a),
  getCurrentPositionAsync: (...a: unknown[]) => mockGetPos(...a),
  getLastKnownPositionAsync: (...a: unknown[]) => mockLastKnown(...a),
  hasServicesEnabledAsync: (...a: unknown[]) => mockServicesEnabled(...a),
  Accuracy: { Highest: 6, Balanced: 3 },
}));
jest.mock("../lib/events", () => ({ events: { log: jest.fn(), flush: jest.fn() } }));

jest.mock("expo-battery", () => ({ getBatteryLevelAsync: () => Promise.resolve(0.8), BatteryState: { CHARGING: 2, FULL: 3 } }));
jest.mock("@react-native-community/datetimepicker", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return { __esModule: true, default: (p: Record<string, unknown>) => React2.createElement(View, { testID: p.testID }) };
});
jest.mock("react-native-google-places-autocomplete", () => {
  const React2 = require("react");
  const { TextInput } = require("react-native");
  return {
    GooglePlacesAutocomplete: React2.forwardRef((p: Record<string, any>, ref: unknown) => {
      React2.useImperativeHandle(ref, () => ({ setAddressText: mockSetAddressText }));
      return React2.createElement(TextInput, { ...(p.textInputProps ?? {}), placeholder: p.placeholder });
    }),
  };
});
jest.mock("../services/journey", () => {
  const actual = jest.requireActual("../services/journey");
  return { ...actual, createJourney: jest.fn() };
});
jest.mock("../services/secureWords", () => ({ secureWords: { get: jest.fn().mockResolvedValue([]), strength: () => "ok", save: jest.fn() } }));
const mockSingle = jest.fn().mockResolvedValue({ data: { word_salt: "salt", id: "j1" } });
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: "tok" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: mockSingle, maybeSingle: jest.fn().mockResolvedValue({ data: null }) }) }) }),
  },
}));

import JourneyNewScreen from "../../app/(user)/journey/new";

const renderScreen = async () => {
  useSession.setState({ userId: "u1" });
  let out: ReturnType<typeof render>;
  await act(async () => {
    out = render(<ThemeProvider><JourneyNewScreen /></ThemeProvider>);
  });
  return out!;
};

const press = async (r: Awaited<ReturnType<typeof render>>, id: string) => {
  await act(async () => { fireEvent.press(r.getByTestId(id)); await new Promise((res) => setTimeout(res, 0)); });
};

beforeEach(() => {
  mockRequestPerm.mockResolvedValue({ status: "denied" });
  mockGetPos.mockClear();
  mockLastKnown.mockClear().mockResolvedValue(null);
  mockServicesEnabled.mockClear().mockResolvedValue(true);
  mockSetAddressText.mockClear();
});

test("permission denied → visible location error, no position read", async () => {
  const r = await renderScreen();
  expect(r.queryByTestId("journey-location-error")).toBeNull();
  await press(r, "journey-from-current");
  expect(r.getByTestId("journey-location-error")).toBeTruthy();
  expect(mockGetPos).not.toHaveBeenCalled();
});

test("F16: granted → position read at Balanced accuracy", async () => {
  mockRequestPerm.mockResolvedValue({ status: "granted" });
  const r = await renderScreen();
  await press(r, "journey-from-current");
  expect(mockGetPos).toHaveBeenCalledWith(expect.objectContaining({ accuracy: 3 }));
  expect(mockSetAddressText).toHaveBeenCalledWith("Current location");
  expect(r.getByTestId("journey-from").props.value).toBe("Current location");
  expect(r.queryByTestId("journey-location-error")).toBeNull();
});

test("invalid GPS coordinates → visible error and no From state", async () => {
  mockRequestPerm.mockResolvedValue({ status: "granted" });
  mockGetPos.mockResolvedValueOnce({ coords: { latitude: 999, longitude: 77.59 } });
  const r = await renderScreen();
  await press(r, "journey-from-current");
  expect(r.getByTestId("journey-location-error")).toBeTruthy();
  expect(mockSetAddressText).not.toHaveBeenCalled();
});

test("F16: location services off → specific error, no position read", async () => {
  mockRequestPerm.mockResolvedValue({ status: "granted" });
  mockServicesEnabled.mockResolvedValue(false);
  const r = await renderScreen();
  await press(r, "journey-from-current");
  expect(r.getByTestId("journey-location-error")).toBeTruthy();
  expect(mockGetPos).not.toHaveBeenCalled();
});

test("F16: fresh fix times out but last-known position is used (no error)", async () => {
  mockRequestPerm.mockResolvedValue({ status: "granted" });
  mockGetPos.mockImplementation(() => new Promise(() => {})); // never resolves
  mockLastKnown.mockResolvedValue({ coords: { latitude: 12.9, longitude: 77.6 } });
  const r = await renderScreen();
  jest.useFakeTimers();
  try {
    await act(async () => { fireEvent.press(r.getByTestId("journey-from-current")); await Promise.resolve(); });
    await act(async () => { jest.advanceTimersByTime(8000); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(mockLastKnown).toHaveBeenCalled();
    expect(r.queryByTestId("journey-location-error")).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test("getCurrentPosition throws → visible location error", async () => {
  mockRequestPerm.mockResolvedValue({ status: "granted" });
  mockGetPos.mockRejectedValueOnce(new Error("unavailable"));
  const r = await renderScreen();
  await press(r, "journey-from-current");
  expect(r.getByTestId("journey-location-error")).toBeTruthy();
});

// G5 (core defect): a device with no GPS fix leaves getCurrentPositionAsync
// pending forever, so the await hung and the error line never showed. An 8 s cap
// (no getLastKnownPositionAsync in this mock) must surface the visible error.
test("no GPS fix (never resolves) → 8 s timeout surfaces the location error", async () => {
  mockRequestPerm.mockResolvedValue({ status: "granted" });
  mockGetPos.mockImplementation(() => new Promise(() => {})); // never resolves
  const r = await renderScreen();
  jest.useFakeTimers();
  try {
    await act(async () => { fireEvent.press(r.getByTestId("journey-from-current")); await Promise.resolve(); });
    expect(r.queryByTestId("journey-location-error")).toBeNull(); // still hanging, not yet timed out
    await act(async () => { jest.advanceTimersByTime(8000); await Promise.resolve(); await Promise.resolve(); });
    expect(r.getByTestId("journey-location-error")).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});
