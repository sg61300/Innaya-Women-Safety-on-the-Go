import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { supabase } from "../lib/supabase";
import { events } from "../lib/events";
import { ALARM_CHANNEL_ID } from "../lib/permissions";
import i18n from "../i18n";

// Expo push token registration + Android alert channels (Task 18 / G2).
//
// G2 root cause: this used to live only on the (setup)/permissions screen and
// ran once on that screen's mount. A returning or re-logged-in user (and any
// guardian who reached the guardian side without a fresh setup pass) therefore
// never (re)registered, so profiles.expo_push_token stayed null and the guardian
// fan-out in apps/api/src/lib/alerts.ts had no token to push to. It also ran
// BEFORE the notification permission step was granted, so even first-run often
// got nothing. Fix: call this on every app start after login (app/index.tsx),
// gated on permission already being granted, and log push_register {ok, reason}
// so a missing token can be traced.
//
// Best-effort and idempotent: channels are (re)created every call; the token is
// fetched and stored only when notification permission is granted and a session
// exists. Every path emits exactly one push_register event.
export async function registerPush(): Promise<void> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("vaira-alerts", {
        name: "Safety alerts",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        bypassDnd: true,
      });
      // R43: loud-override channel — full-volume siren that pierces DnD/silent for
      // guardians who opted in. Requires the bundled siren.mp3 (app.config.ts
      // expo-notifications sounds); the channel only exists after the next EAS build.
      // "vaira-alarm" is the fallback id the api sends to when loud_override is off;
      // ALARM_CHANNEL_ID (…-2) is the DnD-bypassing id created once policy access is
      // held (see below). Both carry ALARM-stream audio attributes so the siren keeps
      // sounding when the phone is in silent mode (the notification stream is muted).
      await Notifications.setNotificationChannelAsync("vaira-alarm", {
        name: i18n.t("perm.alarmChannel"),
        importance: Notifications.AndroidImportance.MAX,
        bypassDnd: true,
        sound: "siren.mp3",
        // R43/D2: route the siren onto the ALARM stream. Without this the sound
        // played on the notification stream (mAudioAttributes=null), which the OS
        // mutes in silent mode. The alarm stream keeps sounding when the phone is
        // silenced. (DND bypass is separate — bypassDnd alone is ignored without
        // notification-policy access.)
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.ALARM,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
        vibrationPattern: [0, 500, 250, 500],
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    // Do not fetch a token until the OS permission is granted. On iOS (and
    // Android 13+) getExpoPushTokenAsync fails without it; on the setup screen this
    // is the state at mount, so we skip and let the next app start register.
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) {
      await events.log("push_register", { ok: false, reason: "permission_not_granted" });
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      await events.log("push_register", { ok: false, reason: "no_session" });
      return;
    }
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    if (!token) {
      await events.log("push_register", { ok: false, reason: "no_token" });
      return;
    }
    const { error } = await supabase.from("profiles").update({ expo_push_token: token }).eq("id", userData.user.id);
    await events.log("push_register", { ok: !error, reason: error ? "update_failed" : "ok" });

    // T2 (R43/D2): on start, if the guardian opted into loud override but the
    // DnD-bypassing -2 channel is gone (e.g. reinstall), recreate it. Android forces
    // bypassDnd:false at creation unless notification-policy access is held, so the
    // channel bypasses DnD only if access is held — no explicit access check needed.
    if (Platform.OS === "android") {
      const { data: prof } = await supabase
        .from("profiles").select("loud_override").eq("id", userData.user.id).maybeSingle();
      if (prof?.loud_override) {
        const existing = await Notifications.getNotificationChannelAsync(ALARM_CHANNEL_ID);
        if (!existing)
          await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
            name: i18n.t("perm.alarmChannel"),
            importance: Notifications.AndroidImportance.MAX,
            bypassDnd: true,
            sound: "siren.mp3",
            audioAttributes: {
              usage: Notifications.AndroidAudioUsage.ALARM,
              contentType: Notifications.AndroidAudioContentType.SONIFICATION,
            },
            vibrationPattern: [0, 500, 250, 500],
            enableVibrate: true,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          });
      }
    }
  } catch (e) {
    await events.log("push_register", { ok: false, reason: (e as Error).message });
  }
}
