import { render, act, fireEvent } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import type { Choice } from "../theme/ThemeProvider";

const mockNavigate = jest.fn();
const searchId = "r1";
jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: (...a: unknown[]) => mockNavigate(...a), push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: searchId }),
  useFocusEffect: (cb: () => void) => require("react").useEffect(() => cb(), []),
  useNavigation: () => ({ addListener: () => () => {}, getParent: () => undefined }),
}));

const mockAnimateToRegion = jest.fn();
jest.mock("react-native-maps", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  // forwardRef + useImperativeHandle so the screen's mapRef.animateToRegion(...)
  // is observable — a city pick must pan the map (D4).
  const MapView = React2.forwardRef((p: Record<string, unknown>, ref: unknown) => {
    React2.useImperativeHandle(ref, () => ({ animateToRegion: (...a: unknown[]) => mockAnimateToRegion(...a) }));
    return React2.createElement(View, { testID: p.testID }, p.children as never);
  });
  // Circle is a native view in the real lib; the stub surfaces testID + the
  // resolved center so a test can prove each region circle sits on its own
  // centroid rather than stacked on the user's origin (F2).
  const Circle = (p: { testID?: string; center?: { latitude: number; longitude: number } }) =>
    React2.createElement(View, {
      testID: p.testID,
      accessibilityLabel: p.center ? `${p.center.latitude},${p.center.longitude}` : undefined,
    });
  return { __esModule: true, default: MapView, Marker: () => null, Circle, Polyline: () => null };
});
jest.mock("@react-native-community/slider", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return { __esModule: true, default: (p: Record<string, unknown>) => React2.createElement(View, { testID: p.testID }) };
});
jest.mock("expo-location", () => ({ getCurrentPositionAsync: jest.fn().mockResolvedValue({ coords: { latitude: 28.6, longitude: 77.2 } }) }));
jest.mock("../lib/supabase", () => ({ supabase: { auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) } } }));
import { supabase } from "../lib/supabase";
jest.mock("../lib/events", () => ({ events: { log: jest.fn() } }));

const mockNear = jest.fn();
const mockReport = jest.fn().mockResolvedValue("r1");
const mockDetail = jest.fn();
jest.mock("../services/regions", () => ({
  ...jest.requireActual("../services/regions"),
  regions: {
    near: (...a: unknown[]) => mockNear(...a),
    report: (...a: unknown[]) => mockReport(...a),
    detail: (...a: unknown[]) => mockDetail(...a),
  },
}));

import { TourProvider } from "../components/tour/TourProvider";
import Regions from "../../app/(user)/regions/index";
import RegionDetail from "../../app/(user)/regions/[id]";

const ROW = { id: "r1", name: "Delhi placeholder 01", city: "Delhi", status: "amber", report_count: 1, radius_m: 150 };

const renderIndex = (pal: Choice = "midnight") =>
  render(<ThemeProvider initial={pal}><TourProvider>{<Regions />}</TourProvider></ThemeProvider>);
const renderDetail = () =>
  render(<ThemeProvider initial="midnight"><TourProvider>{<RegionDetail />}</TourProvider></ThemeProvider>);

beforeEach(() => { jest.clearAllMocks(); mockNear.mockResolvedValue([]); });

describe("regions map screen", () => {
  it("empty state: renders map, city chips, report FAB and empty copy", async () => {
    const { getByTestId } = await renderIndex();
    await act(async () => {});
    getByTestId("regions-map");
    getByTestId("city-Delhi");
    getByTestId("city-Near me");
    getByTestId("report-fab");
    getByTestId("regions-empty");
  });

  it("loaded state: renders a Card row per region with a status chip", async () => {
    mockNear.mockResolvedValue([ROW, { ...ROW, id: "r2", status: "red", report_count: 6 }]);
    const { getByTestId, getAllByText } = await renderIndex();
    await act(async () => {});
    getByTestId("region-row-r1");
    getByTestId("region-row-r2");
    // "Critical"/"Amber" now also label the F15 risk-filter chips, so match >= 1.
    expect(getAllByText("Critical").length).toBeGreaterThan(0);
    expect(getAllByText("Amber").length).toBeGreaterThan(0);
  });

  it("F15: risk filter narrows the list to the chosen level", async () => {
    mockNear.mockResolvedValue([ROW, { ...ROW, id: "r2", status: "red", report_count: 6 }]);
    const { getByTestId, queryByTestId } = await renderIndex();
    await act(async () => {});
    getByTestId("region-row-r1"); // amber
    getByTestId("region-row-r2"); // red
    await act(async () => { fireEvent.press(getByTestId("risk-red")); });
    expect(queryByTestId("region-row-r1")).toBeNull(); // amber filtered out
    getByTestId("region-row-r2");
  });

  it("error state: shows the error copy when near() rejects", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {}); // expected load-failure log
    mockNear.mockRejectedValue(new Error("boom"));
    const { getByTestId } = await renderIndex();
    await act(async () => {});
    getByTestId("regions-error");
    warn.mockRestore();
  });

  it("report flow: FAB opens the form, a reason is required to submit, then report() is called", async () => {
    const { getByTestId } = await renderIndex();
    await act(async () => {});
    await act(async () => { fireEvent.press(getByTestId("report-fab")); });
    getByTestId("report-form");
    // submit disabled until a reason is picked
    await act(async () => { fireEvent.press(getByTestId("report-submit")); });
    expect(mockReport).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(getByTestId("reason-harassment")); });
    await act(async () => { fireEvent.press(getByTestId("report-submit")); });
    expect(mockReport).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "harassment", radiusM: 150 }),
      "u1"
    );
  });

  it("D2: submitting with no signed-in user shows an error and never calls report()", async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValueOnce({ data: { user: null } });
    const { getByTestId } = await renderIndex();
    await act(async () => {});
    await act(async () => { fireEvent.press(getByTestId("report-fab")); });
    await act(async () => { fireEvent.press(getByTestId("reason-harassment")); });
    await act(async () => { fireEvent.press(getByTestId("report-submit")); });
    getByTestId("report-error");
    expect(mockReport).not.toHaveBeenCalled();
  });

  it("D8: pull-to-refresh reloads the list via load()", async () => {
    const { getByTestId } = await renderIndex();
    await act(async () => {});
    mockNear.mockClear();
    const rc = getByTestId("regions-scroll").props.refreshControl;
    expect(rc).toBeTruthy();
    await act(async () => { rc.props.onRefresh(); });
    expect(mockNear).toHaveBeenCalled();
  });

  it("each region circle is centred on its own centroid, not the user origin (F2)", async () => {
    // origin (mocked location) is 28.6,77.2; the region centroid is elsewhere.
    mockNear.mockResolvedValue([{ ...ROW, lat: 28.7, lng: 77.3 }]);
    const { getByTestId } = await renderIndex();
    await act(async () => {});
    expect(getByTestId("region-circle-r1").props.accessibilityLabel).toBe("28.7,77.3");
  });

  it("D4: picking the Delhi chip loads a 15 km radius around Delhi and pans the map", async () => {
    const { getByTestId } = await renderIndex();
    await act(async () => {});
    await act(async () => { fireEvent.press(getByTestId("city-Delhi")); });
    expect(mockNear).toHaveBeenCalledWith(28.6139, 77.209, 15000);
    expect(mockAnimateToRegion).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 28.6139, longitude: 77.209 }), 400
    );
  });

  it("D5: a stale earlier load never overwrites a later one", async () => {
    const { getByTestId, queryByTestId } = await renderIndex();
    await act(async () => {}); // mount "Near me" load resolves []
    let resolveEarly!: (v: unknown) => void, resolveLate!: (v: unknown) => void;
    mockNear
      .mockImplementationOnce(() => new Promise((r) => { resolveEarly = r; }))
      .mockImplementationOnce(() => new Promise((r) => { resolveLate = r; }));
    await act(async () => { fireEvent.press(getByTestId("city-Delhi")); });      // request #2 (early)
    await act(async () => { fireEvent.press(getByTestId("city-Bengaluru")); });  // request #3 (late) — wins
    // resolve the LATER request first, then the earlier (slow) one
    await act(async () => { resolveLate([{ id: "late", name: "L", city: "Bengaluru", status: "amber", report_count: 1, radius_m: 150 }]); });
    await act(async () => { resolveEarly([{ id: "early", name: "E", city: "Bengaluru", status: "red", report_count: 9, radius_m: 150 }]); });
    getByTestId("region-row-late");
    expect(queryByTestId("region-row-early")).toBeNull();
  });

  it("tapping a region row navigates to its detail route", async () => {
    mockNear.mockResolvedValue([ROW]);
    const { getByTestId } = await renderIndex();
    await act(async () => {});
    await act(async () => { fireEvent.press(getByTestId("region-row-r1")); });
    expect(mockNavigate).toHaveBeenCalledWith("/(user)/regions/r1");
  });
});

describe("region detail screen", () => {
  it("loaded: summary, histogram bars and anonymised reports", async () => {
    mockDetail.mockResolvedValue({
      region: { id: "r1", name: "Delhi placeholder 01", city: "Delhi", status: "amber", report_count: 3, radius_m: 150, police_status: "unconfirmed" },
      reports: [{ reason: "harassment" }, { reason: "harassment" }, { reason: "stalking" }],
      histogram: { harassment: 2, stalking: 1 },
    });
    const { getByTestId } = await renderDetail();
    await act(async () => {});
    getByTestId("detail-summary");
    getByTestId("detail-histogram");
    getByTestId("detail-report-0");
    getByTestId("detail-navigate");
    // F13: static header, risk explanation and safety tips are present.
    getByTestId("detail-header");
    getByTestId("detail-risk");
    getByTestId("detail-tips");
  });

  // F14: "Add my report" opens its own route (was: navigate back to the list).
  it("add-my-report navigates to the report route with the region coords", async () => {
    mockDetail.mockResolvedValue({
      region: { id: "r1", name: "X", city: "Delhi", status: "amber", report_count: 1, radius_m: 150, lat: 28.55, lng: 77.25 },
      reports: [],
      histogram: {},
    });
    const { getByTestId } = await renderDetail();
    await act(async () => {});
    await act(async () => { fireEvent.press(getByTestId("detail-add-report")); });
    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({
      pathname: "/(user)/regions/report",
      params: expect.objectContaining({ id: "r1", lat: "28.55", lng: "77.25", radius: "150" }),
    }));
  });

  it("D6: reasons and times render localized copy, not raw keys", async () => {
    mockDetail.mockResolvedValue({
      region: { id: "r1", name: "X", city: "Delhi", status: "amber", report_count: 1, radius_m: 150 },
      reports: [{ reason: "harassment", time_of_day: "night" }],
      histogram: { harassment: 1 },
    });
    const { getByText, queryByText } = await renderDetail();
    await act(async () => {});
    getByText("Harassment"); // report card reason localized
    getByText("Night");      // time_of_day localized
    expect(queryByText(/harassment/)).toBeNull(); // no raw lowercase key anywhere (histogram included)
  });

  it("navigate-around deep-links to the centroid lat,lng — not the placeholder name (F3)", async () => {
    const openURL = jest.spyOn(require("react-native").Linking, "openURL").mockResolvedValue(undefined);
    mockDetail.mockResolvedValue({
      region: { id: "r1", name: "Delhi placeholder 01", city: "Delhi", status: "amber", report_count: 3, radius_m: 150, lat: 28.55, lng: 77.25 },
      reports: [],
      histogram: {},
    });
    const { getByTestId } = await renderDetail();
    await act(async () => {});
    await act(async () => { fireEvent.press(getByTestId("detail-navigate")); });
    expect(openURL).toHaveBeenCalledWith("https://maps.google.com/?daddr=28.55,77.25");
    openURL.mockRestore();
  });

  it("error: shows the error copy when detail() rejects", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {}); // expected load-failure log
    mockDetail.mockRejectedValue(new Error("boom"));
    const { getByTestId } = await renderDetail();
    await act(async () => {});
    getByTestId("detail-error");
    warn.mockRestore();
  });
});
