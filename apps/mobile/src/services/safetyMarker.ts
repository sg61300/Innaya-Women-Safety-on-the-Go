import AsyncStorage from "@react-native-async-storage/async-storage";
import { useJourney } from "../store/journey";

// s32 splash gate. A persisted "a safety flow is live" marker so launch code can
// skip the splash overlay when a journey or SOS is in progress, even on a COLD
// start (the journey store is in-memory and empty on cold start).
//
// Design choice: this only OBSERVES the journey store via subscribe(), so it
// touches NONE of the safety-critical journey/SOS code paths. A safety flow is
// "live" in every protocol state except IDLE/RESOLVED, or while guardians are
// pending (offline SOS) or the siren is playing. Those are the start/end points:
//   START (live becomes true): ARM (protocolRunner.arm -> ctx.state ARMED),
//     Home SOS / emergency word (ctx.state CRITICAL; guardiansPending on offline),
//     adopt on reconnect (protocolRunner adopt -> active ctx.state), siren start.
//   END (live becomes false): resolve (ctx.state RESOLVED), return to IDLE,
//     guardiansPending cleared, siren stopped.
//
// Crash mid-journey (never left stuck on): the marker stores the time of its
// last write and, while live, re-stamps it (throttled). A reader treats a marker
// older than STALE_MS as stuck and clears it. So after a crash the marker
// self-heals within STALE_MS; a genuinely live journey keeps re-stamping (its
// location heartbeats tick the store) so it is never falsely cleared.
export const SAFETY_ACTIVE_KEY = "vaira.safetyActive";
const STALE_MS = 10 * 60_000; // a marker older than this is treated as stuck
const REFRESH_MS = 2 * 60_000; // while live, re-stamp at most this often

type LiveState = { ctx?: { state?: string }; guardiansPending?: boolean; sirenStatus?: string };

export function isLive(s: LiveState): boolean {
  const st = s.ctx?.state;
  const activeState = !!st && st !== "IDLE" && st !== "RESOLVED";
  return activeState || !!s.guardiansPending || s.sirenStatus === "playing";
}

let wasLive = false;
let lastWrite = 0;

// Call once at app start (imported by app/_layout.tsx). Returns the unsubscribe.
export function startSafetyMarker() {
  const persist = (live: boolean) => {
    if (live) {
      const now = Date.now();
      if (!wasLive || now - lastWrite > REFRESH_MS) {
        lastWrite = now;
        AsyncStorage.setItem(SAFETY_ACTIVE_KEY, String(now)).catch(() => {});
      }
    } else if (wasLive) {
      AsyncStorage.removeItem(SAFETY_ACTIVE_KEY).catch(() => {});
    }
    wasLive = live;
  };
  persist(isLive(useJourney.getState()));
  return useJourney.subscribe((s) => persist(isLive(s)));
}

// Fast launch read: one AsyncStorage get (single-digit ms). A marker older than
// STALE_MS is stuck (crash) and is cleared. On a read error, returns false so a
// storage hiccup can never permanently suppress the splash.
export async function isSafetyActiveAtLaunch(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SAFETY_ACTIVE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (Number.isFinite(ts) && Date.now() - ts < STALE_MS) return true;
    await AsyncStorage.removeItem(SAFETY_ACTIVE_KEY);
    return false;
  } catch {
    return false;
  }
}
