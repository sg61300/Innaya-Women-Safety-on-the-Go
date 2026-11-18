import { initialStationary, stationaryStep, deferForTraffic, tier2Passed, type Fix, type LatLng, type StationaryState, type ProtocolEvent } from "@vaira/core";

// ADR-039 device stationary feed. Drives the core stationary watcher from the
// location stream: tier-1 haptic + STATIONARY 1 at 15 min still, one Directions
// traffic call to decide whether to defer tier 2, STATIONARY 2 at 30 min (or up
// to 60 min if heavy traffic keeps deferring it), and a tier-1 "unusual" notify
// after three passes at the same anchor. `send` is the runner-backed dispatcher
// (see feeds.ts); the feed never posts to the API itself.
type Send = (p: { journeyId: string; event: ProtocolEvent }) => Promise<unknown>;
type FetchRoute = (journeyId: string, origin: LatLng, dest: LatLng) => Promise<{ durationSec: number; durationInTrafficSec: number | null }>;

export function createStationaryFeed(o: { journeyId: string; origin: LatLng; dest: LatLng; send: Send; fetchRoute: FetchRoute; haptic: () => void; now?: () => number }) {
  const now = o.now ?? Date.now;
  let st: StationaryState = initialStationary();
  let stopped = false;
  let lastTrafficAt: number | null = null;

  async function traffic(anchor: LatLng) {
    try {
      const r = await o.fetchRoute(o.journeyId, anchor, o.dest);
      st = deferForTraffic(st, r.durationSec, r.durationInTrafficSec ?? r.durationSec, now());
      lastTrafficAt = now();
    } catch (e) {
      console.warn("[stationary] traffic check failed", (e as Error)?.message);
    }
  }

  return {
    async onFix(fix: Fix | null) {
      if (stopped) return;
      const r = stationaryStep(st, fix, now(), { origin: o.origin, dest: o.dest });
      st = r.state;
      if (r.emit?.tier === 1) {
        o.haptic();
        console.log("[stationary] tier 1", st.anchor);
        await o.send({ journeyId: o.journeyId, event: { type: "STATIONARY", tier: 1 } });
        if (st.anchor) await traffic(st.anchor);
      }
      if (r.emit?.tier === 2) {
        console.log("[stationary] tier 2");
        await o.send({ journeyId: o.journeyId, event: { type: "STATIONARY", tier: 2 } });
      }
      // Re-check traffic every 15 min while still and deferred (ADR-039: 15 min at a time).
      if (!r.emit && st.anchor && st.deferUntil !== null && lastTrafficAt !== null && now() - lastTrafficAt >= 15 * 60_000 && now() >= st.deferUntil) {
        await traffic(st.anchor);
      }
    },
    onTier2Passed() {
      const r = tier2Passed(st, now());
      st = r.state;
      if (r.emit) {
        console.log("[stationary] unusual: 3 passes at one anchor");
        void o.send({ journeyId: o.journeyId, event: { type: "STATIONARY", tier: 1 } });
      }
    },
    stop() {
      stopped = true;
    },
  };
}
