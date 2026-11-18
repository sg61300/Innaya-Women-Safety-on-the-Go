import { createRouteFeed } from "../services/routeFeed";
import type { Fix } from "@vaira/core";

// F4/D17: a reroute failure must not be swallowed — the feed reports it (with the
// HTTP status parsed from the api error) instead of only console.warn-ing.
const dest = { lat: 12.9, lng: 77.6 };
const fix = { lat: 12.8, lng: 77.5, at: 1000 } as unknown as Fix;

test("reroute rejection reports the HTTP status via onRouteError", async () => {
  const onRouteError = jest.fn();
  const fetchRoute = jest.fn().mockRejectedValue(new Error("/api/places/route 404"));
  const feed = createRouteFeed({
    journeyId: "j1", dest, send: jest.fn().mockResolvedValue(undefined),
    fetchRoute, onCorridor: jest.fn(), onRouteError, now: () => 1000,
  });
  await feed.onFix(fix);
  expect(fetchRoute).toHaveBeenCalled();
  expect(onRouteError).toHaveBeenCalledWith({ status: 404, message: "/api/places/route 404" });
});

test("a network error with no status reports status null", async () => {
  const onRouteError = jest.fn();
  const fetchRoute = jest.fn().mockRejectedValue(new Error("Network request failed"));
  const feed = createRouteFeed({
    journeyId: "j1", dest, send: jest.fn().mockResolvedValue(undefined),
    fetchRoute, onCorridor: jest.fn(), onRouteError, now: () => 1000,
  });
  await feed.onFix(fix);
  expect(onRouteError).toHaveBeenCalledWith({ status: null, message: "Network request failed" });
});

test("a successful reroute reports no error and passes the in-traffic ETA to onCorridor", async () => {
  const onCorridor = jest.fn();
  const onRouteError = jest.fn();
  const fetchRoute = jest.fn().mockResolvedValue({
    polyline: [{ lat: 12.8, lng: 77.5 }, { lat: 12.9, lng: 77.6 }],
    durationSec: 600, durationInTrafficSec: 900,
  });
  const feed = createRouteFeed({
    journeyId: "j1", dest, send: jest.fn().mockResolvedValue(undefined),
    fetchRoute, onCorridor, onRouteError, now: () => 1000,
  });
  await feed.onFix(fix);
  expect(onRouteError).not.toHaveBeenCalled();
  expect(onCorridor).toHaveBeenCalledWith(expect.any(Array), 900);
});
