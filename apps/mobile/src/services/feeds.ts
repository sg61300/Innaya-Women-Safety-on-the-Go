import { capFor, type Fix, type LatLng, type ProtocolEvent, type ProtocolState } from "@vaira/core";
import * as Haptics from "expo-haptics";
import { useJourney } from "../store/journey";
import { fetchRoute } from "../lib/api";
import { events } from "../lib/events";
import { runner } from "./protocolRunner";
import { createStationaryFeed } from "./stationaryFeed";
import { createRouteFeed } from "./routeFeed";

// Runtime wiring for the ADR-039/040 device feeds. The app singleton runner is
// created with no opts, so the feeds attach at runtime: feeds.attach() builds the
// two feeds bound to the current journey and subscribes the tier-2-pass callback;
// location.ts feeds every fix through feeds.onFix(); Task 24's foreground service
// calls attach() on MONITOR_START and detach() on END/RESOLVED.
//
// `send` is (p) => runner.send(p.event): the runner applies the core transition
// (opens the modal, runs effects, posts /api/journey-state). The feeds never post
// to the API themselves.

// Feeds run only while the journey is actively monitored (ADR-039/040). EMERGENCY
// / CRITICAL are handled by the incident flow, not by stationary/route prompts.
const MONITORING: ReadonlySet<ProtocolState> = new Set<ProtocolState>(["SAFE", "AMBER", "RESOLVED_MONITORING", "LATE_CHECK"]);

let stationary: ReturnType<typeof createStationaryFeed> | null = null;
let route: ReturnType<typeof createRouteFeed> | null = null;
let unsubResolved: (() => void) | null = null;
let capAt: number | null = null;
let capBase: number | null = null; // journey start (ms) the cap window is measured from
let capFired = false;

// F4/D17: last reroute failure, surfaced to the plan sheet (journey/new). Kept as
// a tiny module-level observable so the screen can render it without the journey
// store (owned by another lane). Cleared on attach/detach.
export type RouteErrorInfo = { status: number | null; at: number } | null;
let routeError: RouteErrorInfo = null;
const routeErrorSubs = new Set<(e: RouteErrorInfo) => void>();
function setRouteError(e: RouteErrorInfo) {
  routeError = e;
  routeErrorSubs.forEach((f) => f(e));
}

const send = (p: { journeyId: string; event: ProtocolEvent }) => runner.send(p.event);

export const feeds = {
  attach() {
    const j = useJourney.getState().journey;
    if (!j) return;
    feeds.detach(); // idempotent: never leave a stale feed subscribed
    const journeyId = String(j.id);
    const origin: LatLng = { lat: Number(j.from_lat), lng: Number(j.from_lng) };
    const dest: LatLng = { lat: Number(j.to_lat), lng: Number(j.to_lng) };
    const haptic = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch((e) => console.warn("[feeds] haptic failed", (e as Error)?.message));
    stationary = createStationaryFeed({ journeyId, origin, dest, send, fetchRoute, haptic });
    setRouteError(null);
    route = createRouteFeed({
      journeyId,
      dest,
      send,
      fetchRoute,
      // F4/D17: once the corridor resolves, re-base the ADR-039 monitoring cap on
      // the live resolved ETA rather than the planned eta_seconds. (An already
      // fired cap is left fired.)
      onCorridor: (line, etaSec) => {
        if (capBase !== null) capAt = capBase + capFor(etaSec);
        console.log("[feeds] corridor", line.length, "pts eta", etaSec);
      },
      // F4/D17: a reroute failure is no longer silent — log an events row with the
      // HTTP status and surface it to the plan sheet.
      onRouteError: ({ status }) => {
        setRouteError({ status, at: Date.now() });
        void events.log("route_error", { status }, journeyId);
      },
    });
    unsubResolved = runner.onChallengeResolved(() => {
      // Fires before the runner clears the challenge (see resolveChallenge): a
      // passed STATIONARY challenge restarts the anchor clock (ADR-039).
      if (useJourney.getState().challenge?.kind === "stationary") stationary?.onTier2Passed();
    });
    capFired = false;
    const startAt = new Date(String(j.start_at)).getTime();
    capBase = Number.isFinite(startAt) ? startAt : Date.now();
    capAt = capBase + capFor(Number(j.eta_seconds ?? 0));
  },

  getRouteError: () => routeError,
  subscribeRouteError(cb: (e: RouteErrorInfo) => void) {
    routeErrorSubs.add(cb);
    return () => routeErrorSubs.delete(cb);
  },

  async onFix(fix: Fix) {
    if (!stationary || !route) return;
    if (!MONITORING.has(useJourney.getState().ctx.state)) return;
    // ADR-039 monitoring cap: emit MONITOR_CAP once when the cap window is reached.
    if (!capFired && capAt !== null && (fix.at ?? Date.now()) >= capAt) {
      capFired = true;
      void runner.send({ type: "MONITOR_CAP" });
    }
    await stationary.onFix(fix);
    await route.onFix(fix);
  },

  detach() {
    stationary?.stop();
    route?.stop();
    unsubResolved?.();
    unsubResolved = null;
    stationary = null;
    route = null;
    capAt = null;
    capBase = null;
    capFired = false;
    setRouteError(null);
  },
};
