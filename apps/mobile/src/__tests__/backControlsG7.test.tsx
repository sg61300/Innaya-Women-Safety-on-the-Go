import React from "react";
import { render, act, fireEvent } from "@testing-library/react-native";
import { Alert, BackHandler } from "react-native";
import { ThemeProvider } from "../theme";
import { useSession } from "../store/session";

// G7: journey-plan and safety-words had no on-screen back; hardware Back on a
// filled journey form discarded it without confirming.

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockDispatch = jest.fn();
const mockBeforeRemove: { cb: ((e: any) => void) | null } = { cb: null };
let mockParams: Record<string, unknown> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn(), navigate: jest.fn(), back: mockBack, canGoBack: () => mockCanGoBack() }),
  router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn(), back: (...a: unknown[]) => mockBack(...a), canGoBack: () => mockCanGoBack() },
  useNavigation: () => ({
    addListener: (ev: string, cb: (e: any) => void) => { if (ev === "beforeRemove") mockBeforeRemove.cb = cb; return () => {}; },
    dispatch: (...a: unknown[]) => mockDispatch(...a),
  }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn().mockResolvedValue(undefined) }));
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
import ConfirmSafeScreen from "../../app/(guardian)/confirm-safe";

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
  mockDispatch.mockClear();
  mockCanGoBack.mockReset();
  mockCanGoBack.mockReturnValue(true);
  (Alert.alert as jest.Mock).mockClear();
  backCb = null;
  mockBeforeRemove.cb = null;
  mockParams = {};
});

// Phase 3b (founder 1-A): the journey form's own back link is gone; the only
// back control is the top-bar arrow. Leaving a dirty form is caught by the
// single `beforeRemove` interceptor (top-bar back, hardware back and swipe all
// raise it), which shows the SAME Discard dialog exactly once.
const fireBeforeRemove = async () => {
  const e = { preventDefault: jest.fn(), data: { action: { type: "GO_BACK" } } };
  await act(async () => { mockBeforeRemove.cb!(e); await new Promise((res) => setTimeout(res, 0)); });
  return e;
};

test("journey: the removed form has no on-screen back link and no BackHandler path", async () => {
  await renderJourney();
  expect(mockBeforeRemove.cb).toBeInstanceOf(Function); // the single interceptor is registered
  expect(backCb).toBeNull();                            // no hardware-back listener -> no double dialog
});

test("journey: dirty form + back shows the Discard dialog once and Keep editing stays", async () => {
  const r = await renderJourney();
  await act(async () => { fireEvent.changeText(r.getByTestId("journey-safeword"), "purple kettle"); });
  const e = await fireBeforeRemove();
  expect(e.preventDefault).toHaveBeenCalledTimes(1);   // blocked
  expect(Alert.alert).toHaveBeenCalledTimes(1);        // shown ONCE
  expect(mockDispatch).not.toHaveBeenCalled();         // Keep editing -> no navigation yet
});

test("journey: dirty form + Discard dispatches the blocked action (leaves)", async () => {
  const r = await renderJourney();
  await act(async () => { fireEvent.changeText(r.getByTestId("journey-safeword"), "purple kettle"); });
  const e = await fireBeforeRemove();
  const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as { style?: string; onPress?: () => void }[];
  const discard = buttons.find((b) => b.style === "destructive")!;
  await act(async () => { discard.onPress!(); });
  expect(mockDispatch).toHaveBeenCalledWith(e.data.action);
});

test("journey: clean form leaves with no dialog", async () => {
  await renderJourney();
  const e = await fireBeforeRemove();
  expect(e.preventDefault).not.toHaveBeenCalled();
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

// Phase 3b (founder 2-a): confirm-safe's own "‹ Back" link was removed; the
// top-bar arrow is the only back control.
test("confirm-safe: no on-screen back link (exactly one back control = top bar)", async () => {
  mockParams = { link: "https://example.com/vote" };
  let r: Awaited<ReturnType<typeof render>>;
  await act(async () => { r = await render(<ThemeProvider><ConfirmSafeScreen /></ThemeProvider>); });
  expect(r!.queryByTestId("confirm-back")).toBeNull();
  expect(r!.getByTestId("confirm-forward")).toBeTruthy();
});
