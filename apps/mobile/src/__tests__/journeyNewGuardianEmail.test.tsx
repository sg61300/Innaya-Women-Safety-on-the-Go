import React from "react";
import { render, act, fireEvent } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { useSession } from "../store/session";

// Structural test (pure UI wiring — cannot be made RED first, per the s12
// addendum). It proves the journey-setup screen mounts with the required
// controls and testIDs and that Start is gated until a selfie exists. The
// createJourney logic itself is covered RED→GREEN in journeyCreate.test.ts.

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn(), navigate: jest.fn() }), useNavigation: () => ({ addListener: () => () => {}, dispatch: jest.fn() }) }));

jest.mock("expo-camera", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return {
    // forwardRef + imperative handle so camRef.current.takePictureAsync() works
    // and the blacklist submit test can capture a selfie.
    CameraView: React2.forwardRef((p: Record<string, unknown>, ref: unknown) => {
      React2.useImperativeHandle(ref, () => ({ takePictureAsync: async () => ({ uri: "file:///selfie.jpg" }) }));
      return React2.createElement(View, { testID: p.testID });
    }),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
    // F18: arm-time permission check reads Camera.getCameraPermissionsAsync.
    Camera: { getCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }), requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }) },
  };
});

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted", granted: true, canAskAgain: true }),
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({ coords: { latitude: 12.97, longitude: 77.59 } }),
}));
// F18: arm-time permission check reads Notifications.getPermissionsAsync.
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
}));

const mockBatteryLevel = jest.fn().mockResolvedValue(0.8); // healthy by default (R47d charge check)
jest.mock("expo-battery", () => ({ getBatteryLevelAsync: () => mockBatteryLevel(), BatteryState: { CHARGING: 2, FULL: 3 } }));

jest.mock("@react-native-community/datetimepicker", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return { __esModule: true, default: (p: Record<string, unknown>) => React2.createElement(View, { testID: p.testID }) };
});

// Places autocomplete renders a TextInput that forwards textInputProps (so the
// journey-from / journey-to testIDs land on real inputs).
jest.mock("react-native-google-places-autocomplete", () => {
  const React2 = require("react");
  const { TextInput } = require("react-native");
  return {
    // changeText on the mocked input forwards a fake place through onPress so the
    // destination (and thus canSubmit) can be driven from a test.
    GooglePlacesAutocomplete: (p: Record<string, any>) =>
      React2.createElement(TextInput, {
        ...(p.textInputProps ?? {}),
        placeholder: p.placeholder,
        onChangeText: (t: string) =>
          p.onPress?.({ description: t }, { geometry: { location: { lat: 19.09, lng: 72.9 } } }),
      }),
  };
});

const mockCreate = jest.fn().mockResolvedValue({ id: "j1", dangerZone: false, blacklisted: false });
jest.mock("../services/journey", () => {
  const actual = jest.requireActual("../services/journey");
  return { ...actual, createJourney: (...a: unknown[]) => mockCreate(...a) };
});

// Stub the runner: a real ARM in one test left the screen unusable for the tests after it.
jest.mock("../services/protocolRunner", () => ({ runner: { send: jest.fn(), reconcile: jest.fn() } }));
jest.mock("../services/secureWords", () => ({
  secureWords: { get: jest.fn().mockResolvedValue([]), strength: () => "ok", save: jest.fn() },
}));

const mockSingle = jest.fn().mockResolvedValue({ data: { word_salt: "salt", id: "j1" } });
const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null });
const mockContacts = jest.fn().mockResolvedValue({ data: [{ email: "a-guardian-email" }], error: null });
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: "tok" } } }) },
    from: (t: string) =>
      t === "contacts"
        ? { select: () => ({ eq: () => mockContacts() }) }
        : t === "blacklisted_vehicles"
        ? { select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }
        : { select: () => ({ eq: () => ({ single: mockSingle }) }) },
    rpc: jest.fn().mockResolvedValue({ data: [] }),
  },
}));

import JourneyNewScreen from "../../app/(user)/journey/new";
// journey/new now carries intro-tour targets (TourTarget needs the provider).
import { TourProvider } from "../components/tour/TourProvider";

const renderScreen = async () => {
  useSession.setState({ userId: "u1" });
  let out: ReturnType<typeof render>;
  await act(async () => {
    out = render(
      <ThemeProvider>
        <TourProvider><JourneyNewScreen /></TourProvider>
      </ThemeProvider>
    );
  });
  return out!;
};

beforeEach(() => {
  mockCreate.mockClear();
  mockMaybeSingle.mockResolvedValue({ data: null });
  mockContacts.mockResolvedValue({ data: [{ email: "a-guardian-email" }], error: null });
  mockBatteryLevel.mockResolvedValue(0.8);
});

// T1: a blacklisted plate must be gated BEFORE createJourney runs, so no journey
// is written until the user picks another vehicle or explicitly overrides.
// The screen's onPress handlers (capture, submit) are async — keep act open with a
// macrotask so their state updates (selfieUri, blacklisted) flush before we assert.
const press = async (r: Awaited<ReturnType<typeof render>>, id: string) => {
  await act(async () => {
    fireEvent.press(r.getByTestId(id));
    await new Promise((res) => setTimeout(res, 0));
  });
};

const fillAndCapture = async (r: Awaited<ReturnType<typeof render>>) => {
  fireEvent.changeText(r.getByTestId("journey-from"), "Home");
  fireEvent.changeText(r.getByTestId("journey-to"), "Office");
  fireEvent.changeText(r.getByTestId("journey-safeword"), "purple kettle");
  fireEvent.changeText(r.getByTestId("journey-plate"), "MH 01 AB 1234");
  await press(r, "selfie-capture"); // open camera
  await press(r, "selfie-capture"); // take selfie
  expect(r.getByTestId("selfie-retake")).toBeTruthy();
};

// Founder Q123, Q124: no journey starts unless a guardian has an email id. One flow on one mounted
// screen, in the order she could meet it. A failed read must not tell her to add a guardian.
test("Start needs a guardian with an email id, checked afresh on every press", async () => {
  const r = await renderScreen();
  await fillAndCapture(r);
  for (const rows of [[], [{ email: null }], [{ email: "  " }]]) {
    mockContacts.mockResolvedValue({ data: rows, error: null });
    await press(r, "journey-start");
    expect(r.getByTestId("journey-need-guardian")).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
  }
  mockContacts.mockResolvedValue({ data: null, error: { message: "network" } });
  await press(r, "journey-start");
  expect(mockCreate).not.toHaveBeenCalled();
  expect(r.getByText("Could not start the journey. Please try again.")).toBeTruthy();
  mockContacts.mockResolvedValue({ data: [{ email: null }, { email: "a-guardian-email" }], error: null });
  await press(r, "journey-start");
  expect(r.queryByTestId("journey-need-guardian")).toBeNull();
  expect(mockCreate).toHaveBeenCalledTimes(1);
});
