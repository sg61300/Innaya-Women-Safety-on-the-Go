import { distanceToPolylineM, type LatLng } from "./geo";
import { ROUTE_OFF_M, ROUTE_OFF_MS, ROUTE_AWAY_MS, ROUTE_ETA_FACTOR, ROUTE_AWAY_HYSTERESIS_M, ROUTE_ETA_GROWTH_COUNT } from "./timers";

export interface RouteSample { fix: LatLng; distToDestM: number; liveEtaSec: number | null; at: number }
export interface RouteState { corridor: LatLng[]; corridorEtaSec: number; corridorSetAt: number; offSince: number | null; askedDetour: boolean; awaySince: number | null; askedAway: boolean; lastDistM: number | null; lastEtaSec: number | null; etaGrowth: number }
export function initialRoute(): RouteState { return { corridor: [], corridorEtaSec: 0, corridorSetAt: 0, offSince: null, askedDetour: false, awaySince: null, askedAway: false, lastDistM: null, lastEtaSec: null, etaGrowth: 0 }; }
// A new corridor re-arms the detour rule; the away rule keeps its history (a re-route does not prove she is heading back).
export function setCorridor(state: RouteState, corridor: LatLng[], etaSec: number, now: number): RouteState {
  return { ...state, corridor, corridorEtaSec: etaSec, corridorSetAt: now, offSince: null, askedDetour: false };
}
export function routeStep(state: RouteState, s: RouteSample, now: number): { state: RouteState; emit: null | "detour" | "away" } {
  let st = { ...state };
  // detour: off the corridor for 3 min, or live ETA far above the corridor's ETA
  const off = distanceToPolylineM(s.fix, st.corridor) > ROUTE_OFF_M;
  st.offSince = off ? (st.offSince ?? now) : null;
  const etaDetour = s.liveEtaSec !== null && st.corridorEtaSec > 0 && s.liveEtaSec > ROUTE_ETA_FACTOR * st.corridorEtaSec;
  // away: distance to destination rising (with hysteresis) for 5 min, or ETA rising on 3 consecutive samples
  const rising = st.lastDistM !== null && s.distToDestM > st.lastDistM + ROUTE_AWAY_HYSTERESIS_M;
  const falling = st.lastDistM !== null && s.distToDestM < st.lastDistM - ROUTE_AWAY_HYSTERESIS_M;
  if (rising) st.awaySince = st.awaySince ?? now; else if (falling) { st.awaySince = null; st.askedAway = false; }
  if (s.liveEtaSec !== null) { st.etaGrowth = st.lastEtaSec !== null && s.liveEtaSec > st.lastEtaSec ? st.etaGrowth + 1 : 0; st.lastEtaSec = s.liveEtaSec; }
  st.lastDistM = s.distToDestM;
  let emit: null | "detour" | "away" = null;
  if (!st.askedAway && ((st.awaySince !== null && now - st.awaySince >= ROUTE_AWAY_MS) || st.etaGrowth >= ROUTE_ETA_GROWTH_COUNT)) { st.askedAway = true; st.etaGrowth = 0; emit = "away"; }
  else if (!st.askedDetour && ((st.offSince !== null && now - st.offSince >= ROUTE_OFF_MS) || etaDetour)) { st.askedDetour = true; emit = "detour"; }
  return { state: st, emit };
}
