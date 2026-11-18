import { createStationaryFeed } from "../stationaryFeed";
const MIN = 60_000; const O = { lat: 28.60, lng: 77.20 }, D = { lat: 28.70, lng: 77.30 };
const fix = (at: number) => ({ lat: 28.65, lng: 77.25, accuracyM: 12, speedMps: 0, at });
function make(traffic: { durationSec: number; durationInTrafficSec: number | null } = { durationSec: 600, durationInTrafficSec: 600 }) {
  let t = 0; const send = jest.fn(async () => ({ state: "SAFE", actions: [] })); const haptic = jest.fn(); const fetchRoute = jest.fn(async () => ({ polyline: [], distanceM: 1, ...traffic }));
  const feed = createStationaryFeed({ journeyId: "j1", origin: O, dest: D, send, fetchRoute, haptic, now: () => t });
  return { feed, send, haptic, fetchRoute, tick: async (min: number) => { t = min * MIN; await feed.onFix(fix(t)); } };
}
test("tier 1 → haptic + STATIONARY 1 + one traffic call; tier 2 at 30 → STATIONARY 2", async () => {
  const m = make(); for (let i = 0; i <= 30; i++) await m.tick(i);
  expect(m.haptic).toHaveBeenCalledTimes(1);
  expect(m.send.mock.calls.map((c: any) => c[0].event)).toEqual([{ type: "STATIONARY", tier: 1 }, { type: "STATIONARY", tier: 2 }]);
  expect(m.fetchRoute).toHaveBeenCalledTimes(1);
});
test("heavy traffic defers tier 2 to minute 45, re-checks traffic, fires at 60 regardless", async () => {
  const m = make({ durationSec: 600, durationInTrafficSec: 1500 }); for (let i = 0; i <= 60; i++) await m.tick(i);
  const tier2 = m.send.mock.calls.filter((c: any) => c[0].event.tier === 2);
  expect(tier2).toHaveLength(1); expect(m.fetchRoute.mock.calls.length).toBeGreaterThanOrEqual(3);   // at 15, 30, 45
});
test("onTier2Passed restarts the clock; unusual note after the third pass posts a STATIONARY note event", async () => {
  const m = make(); for (let i = 0; i <= 30; i++) await m.tick(i);
  m.feed.onTier2Passed(); for (let i = 31; i <= 60; i++) await m.tick(i); m.feed.onTier2Passed(); for (let i = 61; i <= 90; i++) await m.tick(i); m.feed.onTier2Passed();
  expect(m.send.mock.calls.filter((c: any) => c[0].event.tier === 2)).toHaveLength(3);
  expect((m.send.mock.calls.at(-1) as any)[0].event).toEqual({ type: "STATIONARY", tier: 1 });       // the note is delivered as a tier-1 notify after the third pass
});
