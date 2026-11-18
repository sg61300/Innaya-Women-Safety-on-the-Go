import { createRouteFeed } from "../routeFeed";
const MIN = 60_000; const D = { lat: 28.70, lng: 77.20 };
const line = [{ lat: 28.60, lng: 77.20 }, D];
test("re-routes every 2 min and on a 300 m departure; emits ROUTE_DEVIATION detour after 3 min off corridor", async () => {
  let t = 0; const send = jest.fn(async () => ({ state: "SAFE", actions: [] })); const onCorridor = jest.fn();
  const fetchRoute = jest.fn(async () => ({ polyline: line, durationSec: 1200, durationInTrafficSec: 1200, distanceM: 11_000 }));
  const feed = createRouteFeed({ journeyId: "j1", dest: D, send, fetchRoute, onCorridor, now: () => t });
  const at = async (min: number, lat: number, lng = 77.20) => { t = min * MIN; await feed.onFix({ lat, lng, accuracyM: 10, speedMps: 8, at: t }); };
  await at(0, 28.60); expect(fetchRoute).toHaveBeenCalledTimes(1); expect(onCorridor).toHaveBeenCalledWith(line, 1200);
  await at(1, 28.61); expect(fetchRoute).toHaveBeenCalledTimes(1);                                     // < 2 min, on corridor
  await at(2, 28.62); expect(fetchRoute).toHaveBeenCalledTimes(2);                                     // 2-min cadence
  await at(2.5, 28.63, 77.2035); expect(fetchRoute).toHaveBeenCalledTimes(3);                          // 300 m departure → immediate re-route
  await at(4, 28.64, 77.2035); await at(5.6, 28.65, 77.2035);
  expect(send).toHaveBeenCalledWith({ journeyId: "j1", event: { type: "ROUTE_DEVIATION", kind: "detour" } });
});
test("a 429 from the proxy is swallowed and retried on the next cadence tick", async () => {
  let t = 0; const send = jest.fn(async () => ({ state: "SAFE", actions: [] }));
  const fetchRoute = jest.fn().mockRejectedValueOnce(new Error("429")).mockResolvedValue({ polyline: line, durationSec: 1200, durationInTrafficSec: null, distanceM: 11_000 });
  const feed = createRouteFeed({ journeyId: "j1", dest: D, send, fetchRoute, onCorridor: jest.fn(), now: () => t });
  await feed.onFix({ lat: 28.60, lng: 77.20, accuracyM: 10, speedMps: 8, at: 0 });
  t = 2 * MIN; await feed.onFix({ lat: 28.61, lng: 77.20, accuracyM: 10, speedMps: 8, at: t });
  expect(fetchRoute).toHaveBeenCalledTimes(2);
});
