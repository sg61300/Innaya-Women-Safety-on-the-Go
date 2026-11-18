import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { isSafetyActiveAtLaunch } from "../services/safetyMarker";

// s32 splash gate decision (founder 2026-10-12). Decides at launch whether to
// show the video splash and, if so, whether the Continue button appears.
//   - Opened by tapping ANY INNAYA notification -> no splash (so a guardian /
//     SOS / alert screen is never hidden by a 5 s overlay).
//   - A journey or SOS is live -> no splash.
//   - First launch after install -> video, NO Continue.
//   - Every later open -> video + Continue (auto-continues at the end if not tapped).
// Cost: one notification read + at most two AsyncStorage reads, all single-digit
// ms; resolved in parallel with font loading so it adds no noticeable launch
// delay (see s32 report).
export const SPLASH_SEEN_KEY = "vaira.splashSeen";

export type SplashDecision = { show: boolean; showContinue: boolean };

export async function resolveSplash(): Promise<SplashDecision> {
  // 1) Opened from a notification tap (cold start). getLastNotificationResponse
  //    returns the response that launched the app.
  try {
    const resp = await Notifications.getLastNotificationResponseAsync?.();
    if (resp) return { show: false, showContinue: false };
  } catch {
    /* ignore — fall through to the other gates */
  }
  // 2) A journey or SOS is active.
  if (await isSafetyActiveAtLaunch()) return { show: false, showContinue: false };
  // 3) First launch vs later open.
  let seen = false;
  try {
    seen = (await AsyncStorage.getItem(SPLASH_SEEN_KEY)) != null;
  } catch {
    /* ignore — treat as first launch */
  }
  if (!seen) {
    AsyncStorage.setItem(SPLASH_SEEN_KEY, "1").catch(() => {});
    return { show: true, showContinue: false };
  }
  return { show: true, showContinue: true };
}
