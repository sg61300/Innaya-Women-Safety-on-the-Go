import { Fragment, useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { Tabs } from "expo-router";
import type { AlarmMode } from "@vaira/core";
import { AppHeader } from "../../src/components/AppHeader";
import { FooterNav } from "../../src/components/FooterNav";
import { AreYouSafeModal } from "../../src/components/AreYouSafeModal";
import { ActiveJourneyCamera } from "../../src/components/HiddenCamera";
import { EmergencyOverlay } from "../../src/components/EmergencyOverlay";
import { ExpiryNotice } from "../../src/components/ExpiryNotice";
import { BatteryPrompt } from "../../src/components/BatteryPrompt";
import { SosModeSheet } from "../../src/components/SosModeSheet";
import { SilentAlarmOverlay } from "../../src/components/SilentAlarmOverlay";
import { CancelWaitingNotice } from "../../src/components/CancelWaitingNotice";
import { PhotoCleanupPrompt } from "../../src/components/PhotoCleanupPrompt";
import { runner } from "../../src/services/protocolRunner";

export default function UserLayout() {
  // ADR-042/R47b: the alarm follows the account. Reconcile the local store against
  // the server on first mount (after auth) and on every foreground resume.
  useEffect(() => {
    void runner.reconcile();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void runner.reconcile();
    });
    return () => sub.remove();
  }, []);

  // ADR-043 item 1: the wearer's own SOS tap alerts guardians + enters CRITICAL at
  // once with a provisional Siren mode, then opens the mode sheet. Picking Silent
  // within the 10 s window re-applies the mode (core treats SOS-again as a mode
  // re-apply). Explicit/auto Siren needs no second send — siren is the default.
  const [sosSheet, setSosSheet] = useState(false);
  const raiseSos = () => {
    void runner.send({ type: "SOS", mode: "siren" });
    setSosSheet(true);
  };
  const onSosChoose = (mode: AlarmMode) => {
    setSosSheet(false);
    if (mode === "silent") void runner.send({ type: "SOS", mode: "silent" });
  };
  return (
    <Fragment>
      {/* F2: sticky brand header above the tab navigator; owns the top safe area. */}
      <View style={{ flex: 1 }}>
      <AppHeader />
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <FooterNav {...props} role="user" onSos={raiseSos} />}
      >
        <Tabs.Screen name="home" options={{ title: "Home" }} />
        {/* F16: `regions` and `journey` are nested Stacks (their own _layout), not
            flat routes, so hardware Back pops to the parent list, not to Home. */}
        <Tabs.Screen name="regions" options={{ title: "Unsafe Regions" }} />
        <Tabs.Screen name="simulate" options={{ title: "Simulation" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
        <Tabs.Screen name="sos" options={{ href: null }} />
        <Tabs.Screen name="journey" options={{ href: null }} />
        <Tabs.Screen name="defence" options={{ href: null }} />
        <Tabs.Screen name="admin" options={{ href: null }} />
        <Tabs.Screen name="gallery" options={{ href: null }} />
      </Tabs>
      </View>
      {/* D12: the monitoring camera, mounted once for the whole journey (armed→end). */}
      <ActiveJourneyCamera />
      {/* Overlays every user screen; visible only while a challenge is open. */}
      <AreYouSafeModal />
      {/* ADR-043 — full-screen CRITICAL overlay (siren countdown + "Not an emergency"
          → cancel flow); silent mode shows the calm SilentAlarmScreen instead. */}
      <EmergencyOverlay />
      {/* ADR-043 item 3 — the calm silent-alarm surface (shown when alarmMode is
          silent); its "Not an emergency" opens the same guardian cancel flow. */}
      <SilentAlarmOverlay />
      {/* Founder Q120, Q121: the status icon and its box while a guardian cancel waits. */}
      <CancelWaitingNotice />
      <PhotoCleanupPrompt />
      {/* ADR-043 item 1 — the Siren/Silent mode choice on the wearer's own SOS tap. */}
      <SosModeSheet visible={sosSheet} onChoose={onSosChoose} />
      {/* ADR-042 — banner shown when the phone returns to an already-archived alarm. */}
      <ExpiryNotice onSos={raiseSos} />
      {/* ADR-042 — non-blocking low-battery charge nudge during a journey. */}
      <BatteryPrompt />
    </Fragment>
  );
}
