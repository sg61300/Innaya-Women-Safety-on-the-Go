import { render } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { GuardianRing, guardiansLabel } from "../components/GuardianRing";
import { JourneyCard } from "../components/JourneyCard";

// F3/D13: the ring and the journey card must show the SAME guardian count string,
// pluralised correctly (1 → "guardian", n → "guardians"), from one shared source.
// One render per test — multiple render/unmount cycles in a single test trip the
// "overlapping act()" guard and corrupt later assertions.

jest.mock("react-native-maps", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  const MapView = (p: Record<string, unknown>) => React2.createElement(View, { testID: p.testID }, p.children as never);
  return { __esModule: true, default: MapView, Marker: () => null, Polyline: () => null, Circle: () => null };
});

const journey = { from: "Home", to: "MG Road", startAt: Date.now(), toCoord: { latitude: 12.9, longitude: 77.6 } };
const ring = (n: number) => <ThemeProvider initial="midnight"><GuardianRing state="safe" guardians={n} emblem={{ uri: "x" }} reduceMotion /></ThemeProvider>;
const card = (n: number) => (
  <ThemeProvider initial="midnight">
    <JourneyCard journey={{ ...journey, guardians: n }} state="SAFE" onPlan={() => {}} onChange={() => {}} onEnd={() => {}} />
  </ThemeProvider>
);

test("shared label pluralises: 1 → singular, other → plural", () => {
  expect(guardiansLabel(1)).toBe("1 guardian");
  expect(guardiansLabel(2)).toBe("2 guardians");
  expect(guardiansLabel(0)).toBe("0 guardians");
});

test("GuardianRing shows the singular for 1", async () => {
  const r = await render(ring(1));
  r.getByText("1 guardian");
});

test("GuardianRing shows the plural for many", async () => {
  const r = await render(ring(4));
  r.getByText("4 guardians");
});

test("JourneyCard shows the singular for 1", async () => {
  const r = await render(card(1));
  expect(r.getByTestId("journey-guardians").props.accessibilityLabel).toBe("1 guardian");
});

test("JourneyCard shows the plural for many", async () => {
  const r = await render(card(3));
  expect(r.getByTestId("journey-guardians").props.accessibilityLabel).toBe("3 guardians");
});

test("ring and card show the SAME string for the same count (one source)", async () => {
  const n = 2;
  const { getAllByText } = await render(
    <ThemeProvider initial="midnight">
      <GuardianRing state="safe" guardians={n} emblem={{ uri: "x" }} reduceMotion />
      <JourneyCard journey={{ ...journey, guardians: n }} state="SAFE" onPlan={() => {}} onChange={() => {}} onEnd={() => {}} />
    </ThemeProvider>,
  );
  expect(getAllByText(guardiansLabel(n)).length).toBeGreaterThanOrEqual(2);
});
