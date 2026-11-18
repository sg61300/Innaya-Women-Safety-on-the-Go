import React from "react";
import { render, act } from "@testing-library/react-native";
import { within } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../theme";
import { palettes } from "../theme/palettes";
import { AppHeader } from "../components/AppHeader";
import i18n from "../i18n";

// Phase 3 (founder 2026-10-15): the single back control is the TOP BAR one
// (AppHeader, testID "app-header-back"); every title-side arrow was removed.
// The original bug was TWO back controls on one screen, so this guards:
//   1. every pushed route shows exactly ONE top-bar back; root tabs show none;
//   2. the chevron is #FFFFFF on dark palettes and p.text on light ones;
//   3. the back label is i18n common.back (en/hi/kn);
//   4. the screens that used to carry a title-side arrow no longer render
//      "profile-back"; their title stays as a heading Text.

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockPath = "/journey/new";

jest.mock("expo-router", () => ({
  usePathname: () => mockPath,
  useRouter: () => ({
    replace: (...a: unknown[]) => mockReplace(...a),
    back: (...a: unknown[]) => mockBack(...a),
    push: jest.fn(),
    navigate: jest.fn(),
    canGoBack: () => true,
  }),
  router: { replace: (...a: unknown[]) => mockReplace(...a), back: (...a: unknown[]) => mockBack(...a), push: jest.fn(), canGoBack: () => true },
}));

// Override jest.setup's null icon stub so the chevron exposes its `color`.
jest.mock("lucide-react-native", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => React2.createElement(View, { testID: "lucide-icon", color: props.color }) });
});

// No signed-in user: the data-backed profile screens short-circuit their mount
// effect and render only the title, so no network mocks are needed.
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }) }),
  },
}));
jest.mock("../components/VitalsTab", () => ({ VitalsTab: () => null }));
jest.mock("../components/HistoryTab", () => ({ HistoryTab: () => null }));
jest.mock("../components/GuardiansTab", () => ({ GuardiansTab: () => null }));
jest.mock("../components/PrivacyTab", () => ({ PrivacyTab: () => null }));
jest.mock("../components/PalettePicker", () => ({ PalettePicker: () => null }));

import DetailsScreen from "../../app/(user)/profile/details";
import GuardiansScreen from "../../app/(user)/profile/guardians";
import LanguageScreen from "../../app/(user)/profile/language";
import AppearanceScreen from "../../app/(user)/profile/appearance";
import VitalsScreen from "../../app/(user)/profile/vitals";
import HistoryScreen from "../../app/(user)/profile/history";
import PrivacyScreen from "../../app/(user)/profile/privacy";
import MyReportsScreen from "../../app/(user)/regions/my-reports";

const SCREENS: { name: string; path: string; Comp: React.ComponentType; titleKey: string }[] = [
  { name: "details", path: "/profile/details", Comp: DetailsScreen, titleKey: "profile.tabDetails" },
  { name: "guardians", path: "/profile/guardians", Comp: GuardiansScreen, titleKey: "profile.tabGuardians" },
  { name: "language", path: "/profile/language", Comp: LanguageScreen, titleKey: "profile.language" },
  { name: "appearance", path: "/profile/appearance", Comp: AppearanceScreen, titleKey: "profile.appearance" },
  { name: "vitals", path: "/profile/vitals", Comp: VitalsScreen, titleKey: "profile.tabVitals" },
  { name: "history", path: "/profile/history", Comp: HistoryScreen, titleKey: "profile.tabHistory" },
  { name: "privacy", path: "/profile/privacy", Comp: PrivacyScreen, titleKey: "profile.tabPrivacy" },
  { name: "my-reports", path: "/regions/my-reports", Comp: MyReportsScreen, titleKey: "regions.myReportsTitle" },
];

const PUSHED = [
  "/journey/new", "/journey/active", "/regions/abc123", "/regions/report",
  "/regions/my-reports", "/profile/vitals", "/profile/details", "/defence",
  "/confirm-safe", "/monitor/j-1", "/admin", "/gallery",
];
const ROOT = ["/", "/home", "/regions", "/profile", "/sos", "/trustees", "/simulate"];

const METRICS = { frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderTree = async (ui: React.ReactElement, initial: string = "system") => {
  let out: ReturnType<typeof render>;
  await act(async () => {
    out = render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider initial={initial as never}>{ui}</ThemeProvider>
      </SafeAreaProvider>,
    );
    await new Promise((res) => setTimeout(res, 0));
  });
  return out!;
};

beforeEach(() => { mockReplace.mockClear(); mockBack.mockClear(); });
afterEach(async () => { await act(async () => { await i18n.changeLanguage("en"); }); });

// --- 1. One top-bar back on pushed routes; none on root tabs ----------------
describe("top-bar back: exactly one on pushed routes, none on root tabs", () => {
  test.each(PUSHED.map((p) => [p]))("pushed %s shows exactly one app-header-back", async (path) => {
    mockPath = path;
    const r = await renderTree(<AppHeader />);
    expect(r.getAllByTestId("app-header-back")).toHaveLength(1);
  });
  test.each(ROOT.map((p) => [p]))("root %s shows no app-header-back", async (path) => {
    mockPath = path;
    const r = await renderTree(<AppHeader />);
    expect(r.queryByTestId("app-header-back")).toBeNull();
  });
});

// --- 2. Chevron colour: white on dark palettes, p.text on light -------------
describe("top-bar chevron colour by palette", () => {
  test("white (#FFFFFF) on a dark palette (midnight)", async () => {
    mockPath = "/journey/new";
    const r = await renderTree(<AppHeader />, "midnight");
    const icon = within(r.getByTestId("app-header-back")).getByTestId("lucide-icon");
    expect(icon.props.color).toBe("#FFFFFF");
  });
  test("p.text on a light palette (violetBloom)", async () => {
    mockPath = "/journey/new";
    const r = await renderTree(<AppHeader />, "violetBloom");
    const icon = within(r.getByTestId("app-header-back")).getByTestId("lucide-icon");
    expect(icon.props.color).toBe(palettes.violetBloom.text);
  });
});

// --- 3. Back label is common.back in each locale ----------------------------
describe("back accessibility label = common.back", () => {
  test.each([["en", "Back"], ["hi", "वापस"], ["kn", "ಹಿಂದೆ"]])("%s", async (lng, expected) => {
    await act(async () => { await i18n.changeLanguage(lng); });
    mockPath = "/journey/new";
    const r = await renderTree(<AppHeader />);
    expect(r.getByTestId("app-header-back").props.accessibilityLabel).toBe(expected);
  });
});

// --- 4. Title-side arrow removed; title stays as a heading ------------------
describe("former title-side-arrow screens: no profile-back, title is a heading", () => {
  test.each(SCREENS.map((s) => [s.name, s]))("%s", async (_name, s) => {
    const { path, Comp, titleKey } = s as (typeof SCREENS)[number];
    mockPath = path;
    const r = await renderTree(
      <>
        <AppHeader />
        <Comp />
      </>,
    );
    expect(r.queryByTestId("profile-back")).toBeNull();
    expect(r.getAllByTestId("app-header-back")).toHaveLength(1);
    expect(r.getByRole("header").props.children).toBe(i18n.t(titleKey));
  });
});
