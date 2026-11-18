import type { ProtocolState } from "./types";
export const CHALLENGE_SPEAK_MS = 3000, CHALLENGE_CRITICAL_MS = 5000, RECONFIRM_MS = 5 * 60_000, HEARTBEAT_MS = 5000;
const GAP_MS: Partial<Record<ProtocolState, number>> = { SAFE: 30_000, AMBER: 30_000, EMERGENCY: 15_000 };
export function challengeDeadlines(t0: number) { return { speakAt: t0 + CHALLENGE_SPEAK_MS, criticalAt: t0 + CHALLENGE_CRITICAL_MS }; }
export function heartbeatVerdict(i: { lastHeartbeatAt: number; now: number; state: ProtocolState; batteryLow: boolean }): "OK"|"AMBER"|"CRITICAL" {
  const limit = GAP_MS[i.state]; if (!limit) return "OK";
  if (i.now - i.lastHeartbeatAt <= limit) return "OK";
  return i.batteryLow ? "AMBER" : "CRITICAL";
}
export function reconfirmDue(lastConfirmAt: number, now: number) { return now - lastConfirmAt >= RECONFIRM_MS; }
export function lateDue(startAt: number, etaSeconds: number, now: number) { return now >= startAt + etaSeconds * 1000; }
export function arrivalDue(distanceToDestM: number) { return distanceToDestM <= 150; }

// ADR-039 monitoring cap and stationary check; ADR-040 route checks
export const CAP_MULTIPLIER = 3, CAP_EXTRA_MS = 30 * 60_000, CAP_MAX_MS = 8 * 3600_000;
export const STATIONARY_T1_MS = 15 * 60_000, STATIONARY_T2_MS = 30 * 60_000, STATIONARY_MAX_DEFER_MS = 60 * 60_000;
export const STATIONARY_DEFER_STEP_MS = 15 * 60_000, STATIONARY_SPEED_MPS = 0.5, STATIONARY_DROPOUT_MS = 120_000, ENDPOINT_M = 150;
export const STATIONARY_RADIUS_MIN_M = 60, STATIONARY_RADIUS_MAX_M = 120, TRAFFIC_DEFER_FACTOR = 1.5;
export const ROUTE_REROUTE_MS = 120_000, ROUTE_OFF_M = 300, ROUTE_OFF_MS = 180_000, ROUTE_AWAY_MS = 300_000, ROUTE_ETA_FACTOR = 1.3, ROUTE_AWAY_HYSTERESIS_M = 20, ROUTE_ETA_GROWTH_COUNT = 3;
export function capFor(etaSeconds: number): number { return Math.min(CAP_MULTIPLIER * etaSeconds * 1000 + CAP_EXTRA_MS, CAP_MAX_MS); }

// ADR-043 cancel-flow / SOS-mode timers (the mobile runner fires these wall-clock).
// SOS_MODE_CHOICE_MS: mode sheet auto-selects Siren after this. SOS_SIREN_DELAY_MS:
// siren starts this long after the tap in siren mode. CANCEL_GUARDIAN_MS: the open
// guardian cancel-request window (no answer → siren stays / stays silent).
// CANCEL_PASSWORD_LOCK_MS: lock before a 3rd app-password attempt is allowed.
export const SOS_MODE_CHOICE_MS = 10_000, SOS_SIREN_DELAY_MS = 10_000, CANCEL_GUARDIAN_MS = 30_000, CANCEL_PASSWORD_LOCK_MS = 30_000;
export function stationaryRadiusM(accuracyM: number): number { return Math.min(STATIONARY_RADIUS_MAX_M, Math.max(STATIONARY_RADIUS_MIN_M, 2 * accuracyM)); }
