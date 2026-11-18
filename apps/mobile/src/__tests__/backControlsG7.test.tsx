import React from "react";
import { render, act, fireEvent } from "@testing-library/react-native";
import { Alert, BackHandler } from "react-native";
import { ThemeProvider } from "../theme";
import { useSession } from "../store/session";
import { ProfileBack } from "../components/ProfileChrome";

// G7: journey-plan and safety-words had no on-screen back; hardware Back on a
// filled journey form discarded it without confirming.

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn(), navigate: jest.fn(), back: mockBack, canGoBack: () => mockCanGoBack() }),
  router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn(), back: (...a: unknown[]) => mockBack(...a), canGoBack: () => mockCanGoBack() },
  useLocalSearchParams: () => ({}),
}));
jest.mock("expo-camera", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return {
    CameraView: React2.forwardRef((p: Record<string, unknown>, _r: unknown) => React2.createElement(View, { testID: p.testID })),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});
jest.mock("expo-location", () => ({ requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), Accuracy: { Highest: 6 } }));
jest.mock("expo-battery", () => ({ getBatteryLevelAsync: () => Promise.resolve(0.8), BatteryState: { CHARGING: 2, FULL: 3 } }));
jest.mock("@react-native-community/datetimepicker", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return { __esModule: true, default: (p: Record<string, unknown>) => React2.createElement(View, { testID: p.testID }) };
});
jest.mock("react-native-google-places-autocomplete", () => {
  const React2 = require("react");
  const { TextInput } = require("react-native");
  return { GooglePlacesAutocomplete: (p: Record<string, any>) => React2.createElement(TextInput, { ...(p.textInputProps ?? {}), placeholder: p.placeholder }) };
});
jest.mock("../services/journey", () => { const a = jest.requireActual("../services/journey"); return { ...a, createJourney: jest.fn() }; });
jest.mock("../services/secureWords", () => ({ secureWords: { get: jest.fn().mockResolvedValue([]), strength: () => "ok", save: jest.fn() } }));
jest.mock("../lib/events", () => ({ events: { log: jest.fn() } }));
jest.mock("expo-speech-recognition", () => ({ ExpoSpeechRecognitionModule: { requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }) } }));
jest.mock("../services/stt", () => ({ stt: { listenOnce: jest.fn().mockResolvedValue("") } }));
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: "tok" } } }),
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: jest.fn().mockResolvedValue({ data: { word_salt: "s" } }), maybeSingle: jest.fn().mockResolvedValue({ data: null }) }) }) }),
  },
}));

import JourneyNewScreen from "../../app/(user)/journey/new";
import SafetyWords from "../../app/(setup)/safety-words";

let backCb: (() => boolean) | null = null;
// Set the spies up once — repeatedly spying/restoring across tests left a stale
// handler captured and interleaved the act() scopes.
jest.spyOn(BackHandler, "addEventListener").mockImplementation(((_e: string, cb: () => boolean) => {
  backCb = cb;
  return { remove: jest.fn() };
}) as any);
jest.spyOn(Alert, "alert").mockImplementation(() => {});

// Matches the proven harness in journeyNewScreen.test.tsx: render inside an async
// act (drains the mount effects) and drive presses through a macrotask so state
// flushes. No manual cleanup — RTL's auto-cleanup handles it, as there.
const renderJourney = async () => {
  useSession.setState({ userId: "u1" });
  let out: ReturnType<typeof render>;
  await act(async () => { out = render(<ThemeProvider><JourneyNewScreen /></ThemeProvider>); });
  return out!;
};

const renderSafety = async () => {
  let out: ReturnType<typeof render>;
  await act(async () => { out = render(<ThemeProvider><SafetyWords /></ThemeProvider>); });
  return out!;
};

const press = async (r: Awaited<ReturnType<typeof render>>, id: string) => {
  await act(async () => { fireEvent.press(r.getByTestId(id)); await new Promise((res) => setTimeout(res, 0)); });
};

beforeEach(() => {
  mockBack.mockClear();
  mockReplace.mockClear();
  mockCanGoBack.mockReset();
  mockCanGoBack.mockReturnValue(true);
  (Alert.alert as jest.Mock).mockClear();
  backCb = null;
});

test("journey: on-screen back present and calls router.back when the form is clean", async () => {
  const r = await renderJourney();
  await press(r, "journey-back");
  expect(mockBack).toHaveBeenCalled();
});

test("journey: hardware Back on a filled form confirms instead of discarding", async () => {
  const r = await renderJourney();
  await act(async () => { fireEvent.changeText(r.getByTestId("journey-safeword"), "purple kettle"); });
  expect(typeof backCb).toBe("function");
  let handled: boolean | undefined;
  await act(async () => { handled = backCb!(); });
  expect(handled).toBe(true); // consumed, not a silent discard
  expect(Alert.alert).toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled(); // navigation waits for confirmation
});

test("journey: hardware Back on a clean form is not intercepted", async () => {
  await renderJourney();
  let handled: boolean | undefined;
  await act(async () => { handled = backCb!(); });
  expect(handled).toBe(false);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test("safety-words: back calls router.back when there is history", async () => {
  mockCanGoBack.mockReturnValue(true);
  const r = await renderSafety();
  await press(r, "words-back");
  expect(mockBack).toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});

// F4: the screen is reached via router.replace (no history), so router.back() is a
// no-op on the main setup path. Fall back to replacing to the profile screen —
// never to "/", which would loop through decideRoute back to safety-words.
test("safety-words: back replaces to profile when there is no history", async () => {
  mockCanGoBack.mockReturnValue(false);
  const r = await renderSafety();
  await press(r, "words-back");
  expect(mockReplace).toHaveBeenCalledWith("/(setup)/profile");
  expect(mockBack).not.toHaveBeenCalled();
});

test("profile child back returns to the Profile card list", async () => {
  const r = await render(<ThemeProvider><ProfileBack title="Vitals" /></ThemeProvider>);
  await press(r, "profile-back");
  expect(mockReplace).toHaveBeenCalledWith("/(user)/profile");
  expect(mockBack).not.toHaveBeenCalled();
});
