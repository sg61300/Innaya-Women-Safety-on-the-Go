import { haversineM, type LatLng } from "./geo";
import { ENDPOINT_M, STATIONARY_DROPOUT_MS, STATIONARY_SPEED_MPS, STATIONARY_T1_MS, STATIONARY_T2_MS, STATIONARY_MAX_DEFER_MS, STATIONARY_DEFER_STEP_MS, TRAFFIC_DEFER_FACTOR, stationaryRadiusM } from "./timers";

export interface Fix extends LatLng { accuracyM: number; speedMps: number | null; at: number }
export interface StationaryState { anchor: Fix | null; stillSince: number | null; lastFixAt: number | null; tier1At: number | null; tier2At: number | null; deferUntil: number | null; passesAtAnchor: number }
export type StationaryEmit = null | { tier: 1 } | { tier: 2 };
export function initialStationary(): StationaryState { return { anchor: null, stillSince: null, lastFixAt: null, tier1At: null, tier2At: null, deferUntil: null, passesAtAnchor: 0 }; }
const reset = (fix: Fix | null, lastFixAt: number | null): StationaryState => ({ ...initialStationary(), anchor: fix, stillSince: fix ? fix.at : null, lastFixAt });

export function stationaryStep(state: StationaryState, fix: Fix | null, now: number, ep: { origin: LatLng; dest: LatLng }): { state: StationaryState; emit: StationaryEmit } {
  if (!fix) {
    if (state.lastFixAt !== null && now - state.lastFixAt > STATIONARY_DROPOUT_MS) return { state: reset(null, state.lastFixAt), emit: null };
    return { state, emit: null };
  }
  if (haversineM(fix, ep.origin) <= ENDPOINT_M || haversineM(fix, ep.dest) <= ENDPOINT_M) return { state: reset(null, fix.at), emit: null };
  let s: StationaryState = { ...state, lastFixAt: fix.at };
  const moving = (fix.speedMps ?? 0) > STATIONARY_SPEED_MPS;
  if (!s.anchor || moving || haversineM(fix, s.anchor) > stationaryRadiusM(Math.max(fix.accuracyM, s.anchor.accuracyM))) {
    s = reset(moving ? null : fix, fix.at);
    return { state: s, emit: null };
  }
  const still = now - (s.stillSince as number);
  if (still >= STATIONARY_T1_MS && s.tier1At === null) return { state: { ...s, tier1At: now }, emit: { tier: 1 } };
  const deferred = s.deferUntil !== null && now <= s.deferUntil && still < STATIONARY_MAX_DEFER_MS;
  if (still >= STATIONARY_T2_MS && s.tier2At === null && !deferred) return { state: { ...s, tier2At: now }, emit: { tier: 2 } };
  return { state: s, emit: null };
}
// Called by the device after the Directions traffic call (ADR-039 §2): defers tier 2 by 15 min at a time, never past 60 min still.
export function deferForTraffic(state: StationaryState, durationSec: number, durationInTrafficSec: number, now: number): StationaryState {
  if (state.stillSince === null || durationInTrafficSec < TRAFFIC_DEFER_FACTOR * durationSec) return { ...state, deferUntil: null };
  return { ...state, deferUntil: Math.min(now + STATIONARY_DEFER_STEP_MS, state.stillSince + STATIONARY_MAX_DEFER_MS) };
}
// Called after a tier-2 challenge passes: same anchor, fresh 30-min clock (tier 1 already given), count passes.
export function tier2Passed(state: StationaryState, now: number): { state: StationaryState; emit: null | { note: "unusual" } } {
  const passes = state.passesAtAnchor + 1;
  const s = { ...state, stillSince: now, tier1At: now, tier2At: null, deferUntil: null, passesAtAnchor: passes };
  return { state: s, emit: passes >= 3 ? { note: "unusual" } : null };
}
