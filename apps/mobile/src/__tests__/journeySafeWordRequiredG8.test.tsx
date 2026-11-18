import React from "react";
import { render, act } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { useSession } from "../store/session";
import i18n from "../i18n";

// G8: the safe word gates arming (canSubmit) but was not marked required. Assert
// the required helper text is shown and the label carries the asterisk marker.

jest.mock("expo-router", () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), back: jest.fn() }), useNavigation: () => ({ addListener: () => () => {}, dispatch: jest.fn() }) }));
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
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: "tok" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: jest.fn().mockResolvedValue({ data: { word_salt: "s" } }), maybeSingle: jest.fn().mockResolvedValue({ data: null }) }) }) }),
  },
}));

import JourneyNewScreen from "../../app/(user)/journey/new";

const renderScreen = async () => {
  useSession.setState({ userId: "u1" });
  let out: ReturnType<typeof render>;
  await act(async () => { out = render(<ThemeProvider><JourneyNewScreen /></ThemeProvider>); });
  return out!;
};

test("safe word is marked required (helper text + label asterisk)", async () => {
  const r = await renderScreen();
  const helper = r.getByTestId("journey-safeword-required");
  expect(helper.props.children).toBe(i18n.t("journeyNew.safeWordRequired"));
  const field = r.getByTestId("journey-safeword");
  // the Field label prop carries the "*" marker
  expect(String(field.props.accessibilityLabel ?? "")).toContain("*");
});
