import React from "react";
import { render, act, fireEvent } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { useSession } from "../store/session";

// ADR-042 / R47d: leaving on a low battery raises a non-blocking charge sheet; its
// Continue starts the journey. Isolated in its own file so the submit()'s trailing
// async never overlaps another test's render (see journeyNewScreen.test.tsx).

jest.mock("expo-router", () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn(), navigate: jest.fn() }), useNavigation: () => ({ addListener: () => () => {}, dispatch: jest.fn() }) }));

jest.mock("expo-camera", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return {
    CameraView: React2.forwardRef((p: Record<string, unknown>, ref: unknown) => {
      React2.useImperativeHandle(ref, () => ({ takePictureAsync: async () => ({ uri: "file:///selfie.jpg" }) }));
      return React2.createElement(View, { testID: p.testID });
    }),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
    Camera: { getCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }), requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }) },
  };
});

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted", granted: true, canAskAgain: true }),
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({ coords: { latitude: 12.97, longitude: 77.59 } }),
}));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
}));

const mockBatteryLevel = jest.fn().mockResolvedValue(0.15); // 15 %
jest.mock("expo-battery", () => ({ getBatteryLevelAsync: () => mockBatteryLevel(), BatteryState: { CHARGING: 2, FULL: 3 } }));

jest.mock("@react-native-community/datetimepicker", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return { __esModule: true, default: (p: Record<string, unknown>) => React2.createElement(View, { testID: p.testID }) };
});

jest.mock("react-native-google-places-autocomplete", () => {
  const React2 = require("react");
  const { TextInput } = require("react-native");
  return {
    GooglePlacesAutocomplete: (p: Record<string, any>) =>
      React2.createElement(TextInput, {
        ...(p.textInputProps ?? {}),
        placeholder: p.placeholder,
        onChangeText: (t: string) => p.onPress?.({ description: t }, { geometry: { location: { lat: 19.09, lng: 72.9 } } }),
      }),
  };
});

const mockCreate = jest.fn().mockResolvedValue({ id: "j1", dangerZone: false, blacklisted: false });
jest.mock("../services/journey", () => {
  const actual = jest.requireActual("../services/journey");
  return { ...actual, createJourney: (...a: unknown[]) => mockCreate(...a) };
});
jest.mock("../services/secureWords", () => ({ secureWords: { get: jest.fn().mockResolvedValue([]), strength: () => "ok", save: jest.fn() } }));
// Stub the runner so ARM does not fire the real service cascade under jest.
jest.mock("../services/protocolRunner", () => ({ runner: { send: jest.fn(), reconcile: jest.fn() } }));

const mockSingle = jest.fn().mockResolvedValue({ data: { word_salt: "salt", id: "j1" } });
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: "tok" } } }) },
    from: (t: string) =>
      t === "contacts"
        ? { select: () => ({ eq: () => Promise.resolve({ data: [{ email: "a-guardian-email" }], error: null }) }) }
        : t === "blacklisted_vehicles"
        ? { select: () => ({ eq: () => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null }) }) }) }
        : { select: () => ({ eq: () => ({ single: mockSingle }) }) },
    rpc: jest.fn().mockResolvedValue({ data: [] }),
  },
}));

import JourneyNewScreen from "../../app/(user)/journey/new";

const press = async (r: Awaited<ReturnType<typeof render>>, id: string) => {
  await act(async () => { fireEvent.press(r.getByTestId(id)); await new Promise((res) => setTimeout(res, 0)); });
};

test("R47d: ≤20 % battery shows a non-blocking charge sheet; Continue then starts", async () => {
  useSession.setState({ userId: "u1" });
  let r!: Awaited<ReturnType<typeof render>>;
  await act(async () => { r = await render(<ThemeProvider><JourneyNewScreen /></ThemeProvider>); });

  fireEvent.changeText(r.getByTestId("journey-from"), "Home");
  fireEvent.changeText(r.getByTestId("journey-to"), "Office");
  fireEvent.changeText(r.getByTestId("journey-safeword"), "purple kettle");
  await press(r, "selfie-capture"); // open camera
  await press(r, "selfie-capture"); // capture selfie

  await press(r, "journey-start");
  expect(r.getByTestId("charge-sheet")).toBeTruthy(); // nudge shown
  expect(mockCreate).not.toHaveBeenCalled(); // not started yet

  await press(r, "charge-continue");
  expect(mockCreate).toHaveBeenCalledTimes(1); // Continue starts the journey
});
