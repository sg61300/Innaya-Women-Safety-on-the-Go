import { capFor } from "@vaira/core";

// F4/D17: feeds must (a) log an events row + expose the reroute failure to the
// plan sheet, and (b) re-base the ADR-039 monitoring cap on the resolved ETA.

jest.mock("../services/protocolRunner", () => ({
  runner: { send: jest.fn().mockResolvedValue(undefined), onChallengeResolved: jest.fn(() => () => {}) },
}));
jest.mock("../services/stationaryFeed", () => ({
  createStationaryFeed: () => ({ onFix: jest.fn().mockResolvedValue(undefined), stop: jest.fn(), onTier2Passed: jest.fn() }),
}));
let routeOpts: any = null;
jest.mock("../services/routeFeed", () => ({
  createRouteFeed: (o: any) => { routeOpts = o; return { onFix: jest.fn().mockResolvedValue(undefined), stop: jest.fn() }; },
}));
jest.mock("../lib/api", () => ({ fetchRoute: jest.fn() }));
const mockLog = jest.fn().mockResolvedValue(undefined);
jest.mock("../lib/events", () => ({ events: { log: (...a: unknown[]) => mockLog(...a) } }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn().mockResolvedValue(undefined), ImpactFeedbackStyle: { Medium: 1 } }));

import { feeds } from "../services/feeds";
import { useJourney } from "../store/journey";

const START = 1_000_000;

beforeEach(() => {
  jest.clearAllMocks();
  routeOpts = null;
  useJourney.setState({
    journey: { id: "j1", from_lat: 12.8, from_lng: 77.5, to_lat: 12.9, to_lng: 77.6, start_at: new Date(START).toISOString(), eta_seconds: 600 },
    ctx: { state: "SAFE", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } as never,
  });
});

afterEach(() => feeds.detach());

test("a reroute failure logs a route_error event and is exposed to subscribers", () => {
  feeds.attach();
  const seen: Array<{ status: number | null } | null> = [];
  const unsub = feeds.subscribeRouteError((e) => seen.push(e));
  routeOpts.onRouteError({ status: 404, message: "/api/places/route 404" });
  expect(mockLog).toHaveBeenCalledWith("route_error", { status: 404 }, "j1");
  expect(feeds.getRouteError()?.status).toBe(404);
  expect(seen[seen.length - 1]?.status).toBe(404);
  unsub();
});

test("the cap re-bases on the resolved ETA once the corridor resolves", async () => {
  const runner = require("../services/protocolRunner").runner;
  feeds.attach();
  // Corridor resolves with a LONGER live ETA than the planned 600s.
  routeOpts.onCorridor([{ lat: 12.8, lng: 77.5 }], 1200);
  // A fix at the OLD planned cap time must no longer trigger MONITOR_CAP.
  await feeds.onFix({ lat: 12.8, lng: 77.5, at: START + capFor(600) } as never);
  expect(runner.send).not.toHaveBeenCalledWith({ type: "MONITOR_CAP" });
  // A fix at the resolved cap time fires it.
  await feeds.onFix({ lat: 12.8, lng: 77.5, at: START + capFor(1200) } as never);
  expect(runner.send).toHaveBeenCalledWith({ type: "MONITOR_CAP" });
});

test("detach clears the surfaced route error", () => {
  feeds.attach();
  routeOpts.onRouteError({ status: 503, message: "x 503" });
  expect(feeds.getRouteError()).not.toBeNull();
  feeds.detach();
  expect(feeds.getRouteError()).toBeNull();
});
