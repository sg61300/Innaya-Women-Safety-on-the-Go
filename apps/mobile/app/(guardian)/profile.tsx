import { useEffect, useRef, useState } from "react";
import { View, Switch, AppState, Platform } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as IntentLauncher from "expo-intent-launcher";
import { UserCog } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Card } from "../../src/components/Card";
import { Button3D } from "../../src/components/Button3D";
import { useTheme } from "../../src/theme";
import { useSession } from "../../src/store/session";
import { supabase } from "../../src/lib/supabase";
import { ALARM_CHANNEL_ID } from "../../src/lib/permissions";
import i18n from "../../src/i18n";

const LOUD_KEY = "vaira.guardian.loudOverride";

export default function GuardianProfileScreen() {
  const { p } = useTheme();
  const router = useRouter();
  const set = useSession((s) => s.set);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loud, setLoud] = useState(false);
  // F1/D2: true once the guardian returned from DnD settings without granting
  // notification-policy access — the toggle stays ON but the alarm can still be
  // silenced by Do Not Disturb.
  const [dndDenied, setDndDenied] = useState(false);
  const dndPending = useRef(false);

  // F1/D2: build the DND-piercing alarm channel under the migration id. Only
  // succeeds (bypassDnd stays true) once notification-policy access is granted;
  // otherwise Android forces bypassDnd:false at creation.
  async function createAlarmChannel() {
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

  // R43: persist the loud-override preference to profiles so the api can route
  // loud pushes. Kept separate from the toggle so the ON case can defer the write
  // until the -2 channel exists (see toggleLoud / T2-F1).
  const persistLoud = async (v: boolean) => {
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id;
      if (!uid) return;
      const { error } = await supabase.from("profiles").update({ loud_override: v }).eq("id", uid);
      if (error) throw error;
    } catch (e) {
      console.warn("[guardian] loud_override sync failed", (e as Error)?.message);
    }
  };

  // Turning the override ON: persist ONLY once the -2 alarm channel exists on the
  // device. T2-F1: the api sends the EMERGENCY/CRITICAL push to ALARM_CHANNEL_ID,
  // and Android drops a push whose channel does not exist — so writing
  // loud_override:true before the channel is created would silently swallow the
  // alarm. If the channel is missing, open notification-policy settings and let
  // finishDndBypass create it + persist on return.
  async function ensureDndBypass() {
    // Non-Android has no channel gate (iOS uses the push sound directly).
    if (Platform.OS !== "android") { await persistLoud(true); return; }
    try {
      const ch = await Notifications.getNotificationChannelAsync(ALARM_CHANNEL_ID);
      if (ch) {
        // Channel exists (bypassing DnD or not): the push will display, so persist.
        setDndDenied(!ch.bypassDnd);
        await persistLoud(true);
        // Still send them to grant DnD access if it is not already bypassing.
        if (!ch.bypassDnd) {
          dndPending.current = true;
          await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.NOTIFICATION_POLICY_ACCESS_SETTINGS);
        }
        return;
      }
      dndPending.current = true;
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.NOTIFICATION_POLICY_ACCESS_SETTINGS);
    } catch (e) {
      dndPending.current = false;
      // Intent failed/threw: the channel was never created, so leave the profile
      // false and warn the guardian the alarm may be silenced.
      setDndDenied(true);
      console.warn("[guardian] DnD access request failed", (e as Error)?.message);
    }
  }

  async function finishDndBypass() {
    dndPending.current = false;
    try {
      await createAlarmChannel();
      const ch = await Notifications.getNotificationChannelAsync(ALARM_CHANNEL_ID);
      if (ch) {
        // Channel now exists (bypassDnd true only if policy access was granted):
        // the push can display, so persist. dndDenied reflects the DnD nuance.
        setDndDenied(!ch.bypassDnd);
        await persistLoud(true);
      } else {
        setDndDenied(true);
      }
    } catch (e) {
      console.warn("[guardian] alarm channel create failed", (e as Error)?.message);
    }
  }

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && dndPending.current) void finishDndBypass();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(LOUD_KEY).then((v) => setLoud(v === "1"));
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id;
      if (!uid) return;
      const { data: prof } = await supabase.from("profiles").select("name, phone, loud_override").eq("id", uid).maybeSingle();
      if (prof) {
        setName((prof as any).name ?? "");
        setPhone((prof as any).phone ?? "");
        // R43: the DB is the source of truth for the loud-override preference;
        // prefer it over the local cache when the column is present.
        if ((prof as any).loud_override != null) setLoud(!!(prof as any).loud_override);
      }
    })();
  }, []);

  const toggleLoud = async (v: boolean) => {
    setLoud(v);
    AsyncStorage.setItem(LOUD_KEY, v ? "1" : "0").catch(() => {});
    if (v) {
      // T2-F1: do NOT write loud_override:true here. ensureDndBypass persists it
      // only once the -2 channel exists (else the api's push would be dropped).
      void ensureDndBypass();
    } else {
      setDndDenied(false);
      await persistLoud(false);
    }
  };

  const switchToMySafety = async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id;
    if (uid) await supabase.from("profiles").update({ role_last_used: "user" }).eq("id", uid);
    set({ role: "user" });
    router.replace("/(user)/home");
  };

  return (
    <Screen scroll padded topInset={false} testID="guardian-profile-screen">
      <View style={{ gap: 14, paddingTop: 8 }}>
        <Text variant="title" color="primary">{i18n.t("guardian.profile.title")}</Text>

        <Card style={{ gap: 8 }}>
          <Text variant="label" color="muted">{i18n.t("guardian.profile.name")}</Text>
          <Text variant="bodyStrong" color="primary" testID="guardian-profile-name">{name || "—"}</Text>
          <Text variant="label" color="muted" style={{ marginTop: 8 }}>{i18n.t("guardian.profile.phone")}</Text>
          <Text variant="bodyStrong" color="primary" testID="guardian-profile-phone">{phone || "—"}</Text>
        </Card>

        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" color="primary">{i18n.t("guardian.profile.loudOverride")}</Text>
              <Text variant="caption" color="muted">{i18n.t("guardian.profile.loudOverrideHint")}</Text>
            </View>
            <Switch testID="guardian-loud-switch" value={loud} onValueChange={toggleLoud} trackColor={{ true: p.brand, false: p.border }} />
          </View>
          {/* F1/D2: one-line explanation of the DnD permission the toggle needs. */}
          <Text testID="guardian-loud-dnd-explain" variant="caption" color="muted">{i18n.t("guardian.profile.dndExplain")}</Text>
          {dndDenied ? (
            <Text testID="guardian-loud-dnd-denied" variant="caption" color={p.stateDanger}>{i18n.t("guardian.profile.dndDenied")}</Text>
          ) : null}
        </Card>

        <Button3D testID="guardian-switch-role" full icon={UserCog} label={i18n.t("guardian.profile.switchToMySafety")} onPress={switchToMySafety} />
      </View>
    </Screen>
  );
}
