import { initialRoute, setCorridor, routeStep, haversineM, distanceToPolylineM, ROUTE_REROUTE_MS, ROUTE_OFF_M, type Fix, type LatLng, type RouteState, type ProtocolEvent } from "@vaira/core";

// ADR-040 device route feed. Keeps a live corridor from the Directions proxy and
// drives the core route watcher: a periodic re-route every ROUTE_REROUTE_MS while
// ON the corridor, an immediate re-route the moment the phone crosses ROUTE_OFF_M
// off it, and the detour / away events core raises. While OFF the corridor the
// periodic re-route is suppressed so the 3-min off-corridor clock in `routeStep`
// can accumulate — a corridor reset on every off-corridor fix would never let it
// reach the detour threshold. `send` is the runner-backed dispatcher (feeds.ts).
type Send = (p: { journeyId: string; event: ProtocolEvent }) => Promise<unknown>;
type FetchRoute = (journeyId: string, origin: LatLng, dest: LatLng) => Promise<{ polyline: LatLng[]; durationSec: number; durationInTrafficSec: number | null }>;

export function createRouteFeed(o: { journeyId: string; dest: LatLng; send: Send; fetchRoute: FetchRoute; onCorridor: (line: LatLng[], etaSec: number) => void; onRouteError?: (info: { status: number | null; message: string }) => void; now?: () => number }) {
  const now = o.now ?? Date.now;
  let st: RouteState = initialRoute();
  let lastRerouteAt: number | null = null;
  let wasOff = false;
  let stopped = false;

  async function reroute(from: LatLng) {
    lastRerouteAt = now();
    try {
      const r = await o.fetchRoute(o.journeyId, from, o.dest);
      const etaSec = r.durationInTrafficSec ?? r.durationSec;
      st = setCorridor(st, r.polyline, etaSec, now());
      o.onCorridor(r.polyline, etaSec);
      return r;
    } catch (e) {
      // F4/D17: surface the failure instead of only warning. The api throws
      // `Error("<path> <status>")`, so the trailing 3-digit code is the HTTP
      // status (null if the message carries none — e.g. a network error).
      const message = (e as Error)?.message ?? "";
      const m = message.match(/(\d{3})\s*$/);
      console.warn("[route] reroute failed", message);
      o.onRouteError?.({ status: m ? Number(m[1]) : null, message });
      return null;
    }
  }

  return {
    async onFix(fix: Fix) {
      if (stopped) return;
      const offNow = st.corridor.length > 0 && distanceToPolylineM(fix, st.corridor) > ROUTE_OFF_M;
      const cadenceDue = lastRerouteAt === null || now() - lastRerouteAt >= ROUTE_REROUTE_MS;
      const departed = offNow && !wasOff; // just crossed off the corridor → re-route once, immediately
      const due = lastRerouteAt === null || departed || (cadenceDue && !offNow);
      const r = due ? await reroute(fix) : null;
      const step = routeStep(
        st,
        { fix, distToDestM: haversineM(fix, o.dest), liveEtaSec: r ? (r.durationInTrafficSec ?? r.durationSec) : null, at: fix.at },
        now()
      );
      st = step.state;
      wasOff = offNow;
      if (step.emit) {
        console.log("[route]", step.emit);
        await o.send({ journeyId: o.journeyId, event: { type: "ROUTE_DEVIATION", kind: step.emit } });
      }
    },
    stop() {
      stopped = true;
    },
  };
}
