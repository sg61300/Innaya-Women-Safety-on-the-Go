import { useEffect, useState } from "react";
import { View, AppState, Keyboard } from "react-native";
import { router } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { PermissionCard } from "../../src/components/PermissionCard";
import { MicGlyph, MapPinGlyph, CameraGlyph, BellGlyph, BatteryGlyph } from "../../src/components/Glyphs";
import type { Button3DIcon } from "../../src/components/Button3D";
import { PERMISSION_STEPS, requestStep, type Step } from "../../src/lib/permissions";
import { events } from "../../src/lib/events";
import { registerPush } from "../../src/services/push";
import i18n from "../../src/i18n";

const ICONS: Record<Step, Button3DIcon> = {
  mic: MicGlyph,
  location: MapPinGlyph,
  camera: CameraGlyph,
  notifications: BellGlyph,
  battery: BatteryGlyph,
};

export default function Permissions() {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [navPending, setNavPending] = useState(false);

  useEffect(() => {
    // D8 guard: if the OTP keyboard was still up on entry, close it here too.
    Keyboard.dismiss();
    registerPush();
  }, []);

  // D1(a): the last step (battery) sends the user to the external
  // IGNORE_BATTERY_OPTIMIZATION_SETTINGS activity. Navigating synchronously on the
  // return from that activity raced the Fabric surface remount — the logcat showed
  // "SurfaceMountingManager … View already has a parent" then "ModuleRegistry was
  // destroyed", leaving a blank white screen. Defer the replace until the app is
  // back in the foreground (AppState "active").
  useEffect(() => {
    if (!navPending) return;
    const go = () => router.replace("/(setup)/profile");
    // Running from this effect already moves the replace off the intent-return
    // callback onto a later React commit. When the app is still resuming
    // (backgrounded/inactive), wait for it to come back to the foreground first.
    if (AppState.currentState === "background" || AppState.currentState === "inactive") {
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "active") {
          sub.remove();
          go();
        }
      });
      return () => sub.remove();
    }
    go();
  }, [navPending]);

  const step = PERMISSION_STEPS[i];
  const total = PERMISSION_STEPS.length;

  function advance() {
    if (i + 1 >= total) setNavPending(true);
    else setI(i + 1);
  }

  async function allow() {
    if (busy) return;
    setBusy(true);
    const result = await requestStep(step.key);
    await events.log("permission", { step: step.key, result });
    setBusy(false);
    advance();
  }

  async function notNow() {
    if (busy) return;
    await events.log("permission", { step: step.key, result: "denied" });
    advance();
  }

  return (
    <Screen
      scroll
      padded
      header={
        // X3 (s25): the title stays fixed while the permission card scrolls.
        <View style={{ paddingTop: 40, paddingBottom: 24 }}>
          <Text variant="display">{i18n.t("perm.title")}</Text>
        </View>
      }
    >
      <View style={{ paddingBottom: 16 }}>
        <PermissionCard
          title={i18n.t(step.titleKey)}
          reason={i18n.t(step.reasonKey)}
          index={i}
          total={total}
          icon={ICONS[step.key]}
          onAllow={allow}
          onNotNow={notNow}
          busy={busy}
        />
      </View>
    </Screen>
  );
}
