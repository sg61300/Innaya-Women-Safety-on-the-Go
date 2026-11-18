// Task 28 (ADR-035, s06): max-volume looping siren + spoken safety prompt.
// expo-av is gone in SDK 57; this uses expo-audio (createAudioPlayer /
// setAudioModeAsync, top-level imports). The siren plays in silent mode and at
// forced system volume so an EMERGENCY is audible even on a muted phone.
import { Platform } from "react-native";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import * as Speech from "expo-speech";
import { VolumeManager } from "react-native-volume-manager";
import * as IntentLauncher from "expo-intent-launcher";
import * as Notifications from "expo-notifications";
import i18n from "../i18n";
import { useSession } from "../store/session";
import { useJourney } from "../store/journey";
import { events } from "../lib/events";
import { ALARM_CHANNEL_ID } from "../lib/permissions";

// F2 (b16): the founder reported the siren inaudible while the overlay claimed
// "Siren on". There is no persistent trace of what the audio stack did on the
// phone, so start() now logs a `siren_error {stage, message}` on any failure and
// a `siren_started {volume, playsInSilentMode, stream}` on success, and mirrors
// the outcome into the journey store so the emergency checklist reflects reality.
function setSirenStatus(s: "playing" | "error" | "unknown") {
  try { useJourney.getState().set({ sirenStatus: s }); } catch { /* store not ready */ }
}

// F8a (founder live test): the expo-audio player above plays the looping siren on
// the MEDIA stream. That stream is silenced by DND ("priority only") and can be
// muted independently of the ringer, so a CRITICAL raised while NOT on a journey
// (SOS from Home) could be silent on a real phone. To guarantee the alarm is heard
// regardless of journey state and regardless of silent/DND, start() ALSO posts a
// local notification on the loud ALARM channel (Task 35): "vaira-alarm-2" bypasses
// DND when notification-policy access is held, else the base "vaira-alarm" channel.
// Both carry ALARM-stream audio attributes + the bundled siren.mp3, so the OS plays
// the siren on the alarm stream, which silent mode does not mute. This is a belt-
// and-braces burst alongside the looping player, not a replacement.
// Android note: a notification sound plays ONCE per post (channels cannot loop it),
// so continuity comes from the expo-audio player; the notification guarantees the
// initial loud alarm-stream sound even when media is muted.
const BASE_ALARM_CHANNEL_ID = "vaira-alarm";
let alarmNotifId: string | null = null;

// The loud ALARM-stream channel is created on the permissions screen, which a
// returning / already-onboarded user skips — so on a real phone it may not exist
// when a CRITICAL fires (confirmed on the b13 build: only "vaira-location" was
// registered). Posting to a missing channel drops the sound onto a default
// channel, so create the base alarm channel on demand before posting. Mirrors the
// permissions-screen config: ALARM usage + the bundled siren.mp3 + MAX importance.
async function ensureBaseAlarmChannel() {
  const existing = await Notifications.getNotificationChannelAsync(BASE_ALARM_CHANNEL_ID);
  if (existing) return;
  await Notifications.setNotificationChannelAsync(BASE_ALARM_CHANNEL_ID, {
    name: i18n.t("perm.alarmChannel"),
    importance: Notifications.AndroidImportance.MAX,
    sound: "siren.mp3",
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
    vibrationPattern: [0, 500, 250, 500],
    enableVibrate: true,
    // bypassDnd is forced false at creation unless policy access is held; the "-2"
    // channel carries the real DND bypass. The ALARM stream is still not muted by
    // silent mode, which is the core of this fix.
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

async function presentAlarmNotification() {
  if (Platform.OS !== "android") return;
  try {
    // Prefer the DND-bypassing "-2" channel when it exists (loud override granted),
    // otherwise use the base alarm channel, creating it first if it is missing.
    let channelId = ALARM_CHANNEL_ID;
    const dnd = await Notifications.getNotificationChannelAsync(ALARM_CHANNEL_ID);
    if (!dnd) {
      await ensureBaseAlarmChannel();
      channelId = BASE_ALARM_CHANNEL_ID;
    }
    alarmNotifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t("siren.notifTitle"),
        body: i18n.t("siren.notifBody"),
        sound: "siren.mp3",
        priority: Notifications.AndroidNotificationPriority.MAX,
        sticky: true,
      },
      trigger: { channelId },
    });
  } catch (e) {
    console.warn("[siren] alarm notification failed", (e as Error).message);
  }
}

async function dismissAlarmNotification() {
  if (!alarmNotifId) return;
  try {
    await Notifications.dismissNotificationAsync(alarmNotifId);
  } catch {
    /* already gone */
  }
  alarmNotifId = null;
}

// Module-level ref: one siren at a time; start() is idempotent while playing.
let player: AudioPlayer | null = null;
// The user's system volume captured at start(), restored at stop(). Forcing
// volume to max for an EMERGENCY must not leave the phone loud afterwards.
let prevVolume: number | null = null;
// Task 29b (ADR-014): a held siren is paused but the player, audio mode and forced
// volume are kept so start() resumes it instantly (CANCEL_HOLD ↔ CRITICAL).
let held = false;

const TTS_LANG = { en: "en-IN", hi: "hi-IN", kn: "kn-IN" } as const;

// getVolume() returns { volume } on the installed react-native-volume-manager;
// tolerate a bare number too. Returns null if the level cannot be read.
async function snapshotVolume(): Promise<number | null> {
  const v = await VolumeManager.getVolume();
  return typeof v === "number" ? v : v?.volume ?? null;
}

// ADR-043 item 3: a silent alert NEVER makes sound on the wearer's own phone.
// alarmMode lives on the core ProtocolContext (lane A owns the field); read it
// defensively so this guard is inert until that field exists at merge.
function isSilent(): boolean {
  try {
    return useJourney.getState().ctx.alarmMode === "silent";
  } catch {
    return false;
  }
}

export const siren = {
  async start() {
    // ADR-043 item 3: refuse to make any sound in silent mode — no player, no
    // forced volume, no loud alarm-channel notification. The silent screen is the
    // only surface. Logged so the absence of a siren is always traceable.
    if (isSilent()) {
      void events.log("siren_suppressed_silent", {});
      return;
    }
    // Resume a held player without rebuilding it (siren stays audible instantly).
    if (player && held) {
      player.play();
      held = false;
      await presentAlarmNotification(); // F8a: re-arm the loud alarm-channel burst
      return;
    }
    if (player) return;
    // F2: run each audio stage under its own stage label so a failure names the
    // exact step in the events log, and set the checklist to failed on any throw.
    let stage = "setAudioMode";
    try {
      await setAudioModeAsync({ playsInSilentMode: true, shouldRouteThroughEarpiece: false });
      stage = "snapshotVolume";
      prevVolume = await snapshotVolume();
      stage = "setVolume";
      await VolumeManager.setVolume(1);
      stage = "createPlayer";
      // siren.mp3 is pulled in via require(), so it is a JS/Metro asset bundled
      // into the app (not an Android res/raw file), and is unaffected by native
      // resource shrinking.
      player = createAudioPlayer(require("../../assets/siren.mp3"));
      player.loop = true;
      stage = "play";
      player.play();
      const vol = await snapshotVolume();
      setSirenStatus("playing");
      void events.log("siren_started", { volume: vol, playsInSilentMode: true, stream: "media+alarmChannel" });
    } catch (e) {
      setSirenStatus("error");
      void events.log("siren_error", { stage, message: (e as Error)?.message ?? String(e) });
      // Clear a half-built player so a later start() can retry from scratch.
      try { player?.remove(); } catch { /* ignore */ }
      player = null;
      throw e;
    }
    // F8a: guarantee an alarm-stream siren even under silent/DND, regardless of
    // journey state. Best-effort — a notification failure never blocks the player.
    await presentAlarmNotification();
  },
  // ADR-014: pause playback but keep the player, audio mode and max volume so a
  // return to CRITICAL (siren.start) resumes instantly.
  async hold() {
    if (!player) return;
    player.pause();
    held = true;
    await dismissAlarmNotification();
  },
  async stop() {
    held = false;
    setSirenStatus("unknown");
    await dismissAlarmNotification();
    if (!player) return;
    // Always clear the ref so a throwing remove() cannot wedge the siren
    // un-restartable (player stuck non-null -> start() short-circuits forever).
    try {
      player.pause();
      player.seekTo(0);
      player.remove();
    } finally {
      player = null;
    }
    if (prevVolume != null) {
      await VolumeManager.setVolume(prevVolume);
      prevVolume = null;
    }
  },
  async speak(text: string) {
    const prev = await snapshotVolume();
    await VolumeManager.setVolume(1);
    const lang = (useSession.getState().profile?.language ?? "en") as keyof typeof TTS_LANG;
    const language = TTS_LANG[lang] ?? "en-IN";
    const restore = () => {
      if (prev != null) void VolumeManager.setVolume(prev);
    };
    // VERIFY on device: hi-IN / kn-IN TTS voices installed (Task 35 QA).
    Speech.speak(text, { language, rate: 0.95, onDone: restore, onError: restore });
  },
  // ARE-YOU-SAFE spoken prompt — copy via i18n, never hard-coded (UX §1.3).
  async speakPrompt() {
    await siren.speak(i18n.t("siren.areYouSafe"));
  },
  async requestDndAccess() {
    if (Platform.OS !== "android") return; // Android-only settings intent
    await IntentLauncher.startActivityAsync(
      "android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS"
    );
  },
};
