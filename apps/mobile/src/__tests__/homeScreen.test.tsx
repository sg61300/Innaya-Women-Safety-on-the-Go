import React from "react";
import { render, act, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemeProvider, palettes, deriveTokens, isDarkPalette, contrastRatio, blend, toHex, darkenUntil } from "../theme";
import type { PaletteKey } from "../theme/palettes";
import type { Choice } from "../theme/ThemeProvider";

const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ navigate: (...a: unknown[]) => mockNavigate(...a), push: jest.fn(), replace: jest.fn() }), useFocusEffect: (cb: () => void) => require("react").useEffect(() => cb(), []), useNavigation: () => ({ addListener: () => () => {}, getParent: () => undefined }) }));

jest.mock("react-native-maps", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  const MapView = (p: Record<string, unknown>) => React2.createElement(View, { testID: p.testID }, p.children as never);
  return { __esModule: true, default: MapView, Marker: () => null, Polyline: () => null, Circle: () => null };
});

jest.mock("expo-location", () => ({ getCurrentPositionAsync: jest.fn().mockResolvedValue({ coords: { latitude: 28.6, longitude: 77.2 } }) }));

// Home now renders the StatusMedallion glow and the route-progress late stripes with
// Skia, which has no jsdom backing — stub its nodes as pass-through Views (the same
// pattern SplashSequence.test uses). We assert the Home ids/behaviour, not the GPU draw.
jest.mock("@shopify/react-native-skia", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  const Node = (p: Record<string, unknown>) => React2.createElement(View, null, (p.children as never) ?? null);
  return {
    Canvas: Node, Group: Node, Circle: Node, Rect: Node, Fill: Node,
    RadialGradient: Node, LinearGradient: Node, Blur: Node,
    vec: (x: number, y: number) => ({ x, y }),
  };
});

const mockPermSummary = jest.fn().mockResolvedValue({ mic: true, location: true, camera: false, notifications: false, battery: true });
jest.mock("../lib/permissions", () => ({ permissionsSummary: () => mockPermSummary(), requestStep: jest.fn().mockResolvedValue("granted") }));

const mockOpenURL = jest.fn().mockResolvedValue(undefined);
jest.spyOn(require("react-native").Linking, "openURL").mockImplementation((...a: unknown[]) => mockOpenURL(...a));

const rpcData = [{ status: "red" }, { status: "amber" }, { status: "safe_by_police" }];
const makeChain = () => {
  const result = { data: { name: "Priya Test", phone: "9876500000" }, count: 3, error: null };
  const c: Record<string, unknown> = {};
  ["select", "eq", "order", "limit"].forEach((m) => { c[m] = () => c; });
  c.single = () => Promise.resolve(result);
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
};
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    from: jest.fn(() => makeChain()),
    rpc: jest.fn().mockResolvedValue({ data: rpcData, error: null }),
  },
}));

import { TourProvider, useTour } from "../components/tour/TourProvider";
import { useJourney } from "../store/journey";
import { initialContext } from "@vaira/core";
import Home, { ringState } from "../../app/(user)/home";

const renderHome = (pal: Choice = "midnight") =>
  render(
    <ThemeProvider initial={pal}>
      <TourProvider>{<Home />}</TourProvider>
    </ThemeProvider>
  );

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem("vaira.tourSeen", "1"); // suppress auto-tour timer in most tests
  useJourney.setState({ journey: null, ctx: initialContext() });
});

describe("ringState mapping (Design/02 §4.4)", () => {
  it("maps each protocol state to a ring band", () => {
    expect(ringState("IDLE")).toBe("idle");
    expect(ringState("ARMED")).toBe("idle");
    expect(ringState("SAFE")).toBe("safe");
    expect(ringState("RESOLVED")).toBe("safe");
    expect(ringState("AMBER")).toBe("amber");
    expect(ringState("LATE_CHECK")).toBe("amber");
    expect(ringState("RESOLVED_MONITORING")).toBe("amber");
    expect(ringState("EMERGENCY")).toBe("emergency");
    expect(ringState("CRITICAL")).toBe("critical");
    expect(ringState("CANCEL_HOLD")).toBe("critical");
  });
});

describe("dashboard — idle", () => {
  it("renders the mandatory ids and tour targets", async () => {
    const { getByTestId } = await renderHome();
    await act(async () => {});
    getByTestId("home-scroll");
    getByTestId("home-help");
    getByTestId("quick-call");
    getByTestId("quick-video");
    expect(getByTestId("voice-fab")).toBeTruthy();
    const quickActions = getByTestId("home-quick-actions");
    expect(quickActions.props.style).toEqual(expect.objectContaining({ flexDirection: "row" }));
    getByTestId("journey-card");
    getByTestId("plan-journey");
    getByTestId("regions-summary");
    getByTestId("vitals-summary");
    getByTestId("defence-card");
    getByTestId("voice-fab");
    getByTestId("status-chip");
  });

  it("shows the greeting first name and the amber+red region count", async () => {
    const { getByText, findByText } = await renderHome();
    await findByText("Priya"); // first name only, from "Priya Test"
    await findByText("2"); // red + amber counted, safe_by_police excluded
    getByText("Connect a watch to add vital monitoring");
  });

  it("keeps all Home cards rendered when the optional region request fails", async () => {
    const supabase = require("../lib/supabase").supabase;
    (supabase.rpc as jest.Mock).mockRejectedValueOnce(new Error("regions unavailable"));
    const { getByTestId, queryByTestId } = await renderHome();
    await act(async () => {});
    getByTestId("regions-summary");
    getByTestId("vitals-summary");
    getByTestId("defence-card");
    getByTestId("products-card");
  });

  // I9 (founder ruling A): the vitals / self-defence / jewellery cards were
  // wrapped in Entrance (a Reanimated fade from opacity 0). On the post-login
  // mount the animation was dropped and the cards stayed transparent. The fade is
  // removed, so none of the three may have an opacity-bearing ancestor.
  it("renders the three cards with no opacity (entrance fade) ancestor", async () => {
    const { getByTestId } = await renderHome();
    await act(async () => {});
    const hasOpacityAncestor = (node: { parent: unknown }) => {
      let n: any = node.parent;
      while (n) {
        const s = n.props?.style;
        for (const st of (Array.isArray(s) ? s : [s])) {
          if (st && typeof st === "object" && "opacity" in st) return true;
        }
        n = n.parent;
      }
      return false;
    };
    for (const id of ["vitals-summary", "defence-card", "products-card"]) {
      expect(hasOpacityAncestor(getByTestId(id) as never)).toBe(false);
    }
  });

  it("quick-call opens the primary guardian tel: link", async () => {
    const { getByTestId } = await renderHome();
    await act(async () => {});
    const { fireEvent } = require("@testing-library/react-native");
    await act(async () => { fireEvent.press(getByTestId("quick-call")); });
    expect(mockOpenURL).toHaveBeenCalledWith("tel:+919876500000");
  });

  it("plan-journey navigates to the journey planner", async () => {
    const { getByTestId } = await renderHome();
    await act(async () => {});
    const { fireEvent } = require("@testing-library/react-native");
    await act(async () => { fireEvent.press(getByTestId("plan-journey")); });
    expect(mockNavigate).toHaveBeenCalledWith("/(user)/journey/new");
  });
});

describe("dashboard — active journey", () => {
  it("renders the active journey card with end/arrived actions, no plan button", async () => {
    useJourney.setState({
      journey: { from: "Home", to: "MG Road", mode: "Cab", eta: "18 min", guardians: 3, toCoord: { latitude: 12.97, longitude: 77.59 } },
      ctx: { state: "SAFE", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const },
    });
    const { getByTestId, queryByTestId } = await renderHome();
    await act(async () => {});
    getByTestId("journey-end");
    getByTestId("journey-arrived");
    getByTestId("journey-change");
    getByTestId("journey-guardians");
    expect(queryByTestId("plan-journey")).toBeNull();
  });

  it("end journey sends END to the runner", async () => {
    const runner = require("../services/protocolRunner").runner;
    const spy = jest.spyOn(runner, "send");
    useJourney.setState({ journey: { to: "MG Road" }, ctx: { state: "AMBER", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } });
    const { getByTestId } = await renderHome();
    await act(async () => {});
    const { fireEvent } = require("@testing-library/react-native");
    await act(async () => { fireEvent.press(getByTestId("journey-end")); });
    expect(spy).toHaveBeenCalledWith({ type: "END" });
  });
});

// F2/D7: the home scroll must reserve at least the shared FAB clearance at the
// bottom so the mic FAB never overlaps the last card ("Change time or route").
describe("home reserves the shared FAB bottom inset (F2/D7)", () => {
  it("home-scroll content bottom padding is >= FAB_INSET", async () => {
    const { FAB_INSET } = require("../components/VoiceFab");
    const { getByTestId } = await renderHome();
    await act(async () => {});
    const style = getByTestId("home-scroll").props.contentContainerStyle;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    expect(flat.paddingBottom).toBeGreaterThanOrEqual(FAB_INSET);
  });
});

describe("dashboard — first-login toast + mic prompt", () => {
  it("shows the toast once then flags it, and shows the mic prompt when mic is denied", async () => {
    await AsyncStorage.removeItem("vaira.firstLoginShown");
    mockPermSummary.mockResolvedValueOnce({ mic: false, location: true, camera: false, notifications: false, battery: true });
    const { getByTestId } = await renderHome();
    await act(async () => {});
    getByTestId("home-toast");
    getByTestId("mic-prompt");
    expect(await AsyncStorage.getItem("vaira.firstLoginShown")).toBe("1");
  });

  it("keeps a visible microphone failure state after the prompt is dismissed", async () => {
    mockPermSummary.mockResolvedValue({ location: true, mic: false, camera: true, notifications: true, battery: true });
    const { getByTestId, queryByTestId } = await renderHome();
    await act(async () => {});
    await act(async () => { fireEvent.press(getByTestId("mic-prompt-dismiss")); });
    expect(queryByTestId("mic-prompt")).toBeNull();
    expect(getByTestId("mic-denied")).toBeTruthy();
  });

  it("does not show the toast when already flagged", async () => {
    await AsyncStorage.setItem("vaira.firstLoginShown", "1");
    const { queryByTestId } = await renderHome();
    await act(async () => {});
    expect(queryByTestId("home-toast")).toBeNull();
  });
});

// R38 auto-tour must fire exactly once. The bug: the first-mount effect depended
// on the whole tour context object, which TourProvider recreates every render;
// start() itself re-renders the provider (setActive/setRect), so an active tour
// on home re-ran the effect and rescheduled start() every ~400 ms — resetting to
// step 0 forever. The fix guards with a ref and depends on []. This exercises the
// real TourProvider (tourSeen unset) and counts start() logs across settle cycles.
describe("first-run auto-tour starts once and never bounces (F1)", () => {
  // Drains the microtask queue so the AsyncStorage-gated reschedule (old bug) has
  // every chance to run before we assert — otherwise the test would pass the buggy
  // code by simply out-racing it.
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

  it("schedules the 400 ms start timer once despite provider re-renders", async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(globalThis, "setTimeout");
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {}); // silence [tour] logs
    const started400 = () => setTimeoutSpy.mock.calls.filter((c: unknown[]) => c[1] === 400).length;
    // Captures the live tour context so the test can force provider re-renders
    // (index changes) — the exact re-render storm start()/measure() produce during
    // a live tour on the home screen.
    let tourApi: ReturnType<typeof useTour> | null = null;
    const Probe = () => { tourApi = useTour(); return null; };
    try {
      await AsyncStorage.removeItem("vaira.tourSeen");
      await render(
        <ThemeProvider initial="midnight">
          <TourProvider>{<><Home /><Probe /></>}</TourProvider>
        </ThemeProvider>
      );
      // Single act scope (nested timer + microtask work must not overlap acts).
      // Under the old [tour]-keyed effect, every provider re-render re-runs the
      // first-mount effect, which re-reads tourSeen and schedules ANOTHER 400 ms
      // start; flush() drains those async reschedules so the buggy code cannot
      // out-race the assertion.
      await act(async () => {
        await flush();                 // initial effect schedules start #1
        jest.advanceTimersByTime(400); // fire start #1 → tour active
        await flush();
        tourApi?.next();               // force a provider re-render
        await flush();                 // old code reschedules start #2 here
        tourApi?.prev();               // and another
        await flush();                 // old code reschedules start #3 here
      });
      // The fix guards with a ref + [] deps, so exactly one start timer is ever
      // scheduled no matter how many times the provider re-renders.
      expect(started400()).toBe(1);
    } finally {
      logSpy.mockRestore();
      setTimeoutSpy.mockRestore();
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});

// Quick-action pill faces carry white glyphs/labels — they must pass the same
// darkenUntil 4.5:1 guard as d.btn in every palette.
describe("quick-action pill faces pass the contrast guard in all palettes", () => {
  const ALL = Object.keys(palettes) as PaletteKey[];
  it.each(ALL)("call/video/mic faces are >= 4.5:1 on white in %s", (pal) => {
    const p = palettes[pal];
    const d = deriveTokens(p, isDarkPalette(pal));
    for (const face of [darkenUntil(p.stateSafe, d.onPrimary), darkenUntil(p.teal, d.onPrimary), darkenUntil(p.brand, d.onPrimary)]) {
      expect(contrastRatio(d.onPrimary, toHex(blend(face, p.bgCard)))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
