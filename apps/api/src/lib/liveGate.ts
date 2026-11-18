// ADR-039 §3: unmasked footage reaches guardians only during an alarm.
export const LIVE_STATES = new Set(["EMERGENCY", "CRITICAL", "CANCEL_HOLD"]);
// R47c: an expired/done journey is archived, never live, even though its last
// protocol state (kept for the record) may still read EMERGENCY/CRITICAL.
const ARCHIVED = new Set(["expired", "done"]);
export function liveAllowed(state: string | null | undefined, status?: string | null): boolean {
  return !!state && LIVE_STATES.has(state) && !ARCHIVED.has(status ?? "");
}
export function guardianView(state: string | null | undefined, status?: string | null) {
  const ok = liveAllowed(state, status);
  const archived = ARCHIVED.has(status ?? "");
  return { showFrames: ok, showLive: ok, note: ok ? null : archived ? "Archived, no live feed." : "Location and status only until an alarm." };
}
