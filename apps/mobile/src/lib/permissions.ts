import * as Location from "expo-location";
import { Camera } from "expo-camera";
// s06, ADR-035: expo-av is dropped (not in SDK 57). Recording permission now
// comes from expo-audio's AudioModule, same { granted } response shape.
import { AudioModule } from "expo-audio";
import * as Notifications from "expo-notifications";
import * as IntentLauncher from "expo-intent-launcher";

// F1/D2 (R43): the loud-override alarm channel id. A DND-bypassing channel can
// only be created AFTER the app is granted notification-policy access — Android
// caches a channel's bypassDnd at creation and never lets it flip, so the
// override toggle creates a FRESH id (…-2) once access is granted rather than
// mutating the original "vaira-alarm". This is the single source of truth for
// that id; every place that creates the channel or sends an alarm push must
// import it (see the lane-D report for the out-of-scope call sites).
export const ALARM_CHANNEL_ID = "vaira-alarm-2";

export type Step = "mic" | "location" | "camera" | "notifications" | "battery";

// Ordered onboarding steps. Titles/reasons are i18n keys (resolved by the card)
// so no user-facing copy is hard-coded here — the copy lives in en.json under
// perm.<key>.title / perm.<key>.reason (UX §3.6).
export const PERMISSION_STEPS: { key: Step; titleKey: string; reasonKey: string }[] = [
  { key: "mic", titleKey: "perm.mic.title", reasonKey: "perm.mic.reason" },
  { key: "location", titleKey: "perm.location.title", reasonKey: "perm.location.reason" },
  { key: "camera", titleKey: "perm.camera.title", reasonKey: "perm.camera.reason" },
  { key: "notifications", titleKey: "perm.notifications.title", reasonKey: "perm.notifications.reason" },
  { key: "battery", titleKey: "perm.battery.title", reasonKey: "perm.battery.reason" },
];

export async function requestStep(step: Step): Promise<"granted" | "denied"> {
  switch (step) {
    case "mic":
      return (await AudioModule.requestRecordingPermissionsAsync()).granted ? "granted" : "denied";
    case "location": {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (!fg.granted) return "denied";
      return (await Location.requestBackgroundPermissionsAsync()).granted ? "granted" : "denied";
    }
    case "camera":
      return (await Camera.requestCameraPermissionsAsync()).granted ? "granted" : "denied";
    case "notifications":
      return (await Notifications.requestPermissionsAsync()).granted ? "granted" : "denied";
    case "battery":
      // Android-only settings intent; there is no grant result, so treat the
      // step as satisfied once the user has been taken to the settings screen.
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
      return "granted";
  }
}

export async function permissionsSummary(): Promise<Record<Step, boolean>> {
  return {
    mic: (await AudioModule.getRecordingPermissionsAsync()).granted,
    location: (await Location.getBackgroundPermissionsAsync()).granted,
    camera: (await Camera.getCameraPermissionsAsync()).granted,
    notifications: (await Notifications.getPermissionsAsync()).granted,
    battery: true,
  };
}

// A journey may only start once we can hear and locate her (ADR core gate).
export const canStartJourney = (s: Record<Step, boolean>) => s.mic && s.location;

// F18 (b16): journey-arm permission steps and their grant/ask-again state.
export type JourneyPermStep = "location" | "mic" | "camera" | "notifications";
export type PermResult = { granted: boolean; canAskAgain: boolean };
// mic and location are essential (the location|microphone foreground service
// cannot start without them). camera/notifications are best-effort.
const ESSENTIAL: JourneyPermStep[] = ["location", "mic"];
export const JOURNEY_PERM_ORDER: JourneyPermStep[] = ["location", "mic", "camera", "notifications"];

async function getJourneyPerm(step: JourneyPermStep): Promise<PermResult> {
  switch (step) {
    case "location": { const r = await Location.getForegroundPermissionsAsync(); return { granted: r.granted, canAskAgain: r.canAskAgain ?? true }; }
    case "mic": { const r = await AudioModule.getRecordingPermissionsAsync(); return { granted: r.granted, canAskAgain: (r as { canAskAgain?: boolean }).canAskAgain ?? true }; }
    case "camera": { const r = await Camera.getCameraPermissionsAsync(); return { granted: r.granted, canAskAgain: r.canAskAgain ?? true }; }
    case "notifications": { const r = await Notifications.getPermissionsAsync(); return { granted: r.granted, canAskAgain: r.canAskAgain ?? true }; }
  }
}

async function requestJourneyPerm(step: JourneyPermStep): Promise<PermResult> {
  switch (step) {
    case "location": {
      const fg = await Location.requestForegroundPermissionsAsync();
      void Location.requestBackgroundPermissionsAsync().catch(() => {}); // best-effort, non-blocking
      return { granted: fg.granted, canAskAgain: fg.canAskAgain ?? true };
    }
    case "mic": { const r = await AudioModule.requestRecordingPermissionsAsync(); return { granted: r.granted, canAskAgain: (r as { canAskAgain?: boolean }).canAskAgain ?? true }; }
    case "camera": { const r = await Camera.requestCameraPermissionsAsync(); return { granted: r.granted, canAskAgain: r.canAskAgain ?? true }; }
    case "notifications": { const r = await Notifications.requestPermissionsAsync(); return { granted: r.granted, canAskAgain: r.canAskAgain ?? true }; }
  }
}

// F18: before arming, ask for each journey permission in order with the system
// dialog, but only for ones not already granted. Returns the final grant map and
// the list of ESSENTIAL steps that are permanently denied (canAskAgain === false)
// so the caller can show an "Open settings" sheet instead of a silent dead tap.
// A system prompt is always preferred over a trip to Settings while one is possible.
export async function ensureJourneyPermissions(): Promise<{ granted: Record<JourneyPermStep, boolean>; blocked: JourneyPermStep[] }> {
  const granted = {} as Record<JourneyPermStep, boolean>;
  const blocked: JourneyPermStep[] = [];
  for (const step of JOURNEY_PERM_ORDER) {
    let res = await getJourneyPerm(step);
    if (!res.granted && res.canAskAgain) res = await requestJourneyPerm(step);
    granted[step] = res.granted;
    if (!res.granted && !res.canAskAgain && ESSENTIAL.includes(step)) blocked.push(step);
  }
  return { granted, blocked };
}
