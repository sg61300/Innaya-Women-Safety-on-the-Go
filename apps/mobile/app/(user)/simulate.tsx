// Task 32 — Simulation page (3 cards). Amendment (Tasks/04 row 32): three Cards
// with Button3D variant="ghost"; the PRACTICE banner is a Chip kind="brand" row;
// FakeLiveStream keeps its safe-word exit gate; TourTarget id="simulate" wraps
// the card list.
import { useEffect, useRef, useState } from "react";
import { View, ScrollView, Linking, Alert } from "react-native";
import { useScrollTopOnFocus } from "../../src/lib/useScrollTopOnFocus";
import { useTheme } from "../../src/theme";
import { Text } from "../../src/components/Text";
import { Card } from "../../src/components/Card";
import { Chip } from "../../src/components/Chip";
import { Button3D } from "../../src/components/Button3D";
import { Illustration } from "../../src/components/Illustration";
import { TourTarget, useTourScroller } from "../../src/components/tour/TourProvider";
import { FakeLiveStream } from "../../src/components/FakeLiveStream";
import { simulation, drillScript } from "../../src/services/simulation";
import { links } from "../../src/lib/links";
import { supabase } from "../../src/lib/supabase";
import { events } from "../../src/lib/events";
import { useSession } from "../../src/store/session";
import i18n from "../../src/i18n";

type DrillState = "idle" | "running" | "done";

export default function SimulateScreen() {
  const { p, d } = useTheme();
  const [drillState, setDrillState] = useState<DrillState>("idle");
  const [step, setStep] = useState(-1); // highest scripted step reached
  const [score, setScore] = useState(0);
  const [live, setLive] = useState(false);
  const [primaryPhone, setPrimaryPhone] = useState<string | null>(null);
  const userId = useSession((s) => s.userId);
  const scrollRef = useRef<ScrollView>(null);
  useScrollTopOnFocus(scrollRef); // F17: reset to top when the Simulate tab regains focus
  useTourScroller("/(user)/simulate", scrollRef); // F6: scroll tour targets into view

  // First primary contact for the WhatsApp video-call card.
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("contacts")
          .select("phone")
          .eq("owner_id", userId)
          .eq("tier", "primary")
          .order("position", { ascending: true })
          .limit(1)
          .maybeSingle();
        setPrimaryPhone((data as { phone?: string } | null)?.phone ?? null);
      } catch (e) {
        console.warn("[simulate] load primary contact failed", (e as Error)?.message);
      }
    })();
  }, [userId]);

  function startDrill() {
    // F1: drill() refuses while a real journey is active (runner is shared).
    // Ask first so the card never shows "running" for a drill that never began.
    const ok = simulation.drill(
      (i) => setStep(i),
      (s) => {
        setScore(s);
        setDrillState("done");
      }
    );
    if (!ok) {
      Alert.alert(i18n.t("simulate.drill.busyTitle"), i18n.t("simulate.drill.busyBody"));
      return;
    }
    setDrillState("running");
    setStep(-1);
    setScore(0);
  }

  function callGuardian() {
    if (!primaryPhone) return;
    Linking.openURL(links.whatsapp(primaryPhone)).catch(() => {});
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bgBase }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 12 }} testID="simulate-scroll">
        <Text variant="title">{i18n.t("simulate.title")}</Text>
        <Text variant="body" color="muted">{i18n.t("simulate.sub")}</Text>

        <TourTarget id="simulate" style={{ gap: 12 }}>
          {/* Card 1 — practice drill */}
          <Card variant="raised" testID="sim-card-drill">
            <Illustration name="simulate-drill" size={56} style={{ marginBottom: 8 }} />
            <Text variant="bodyStrong">{i18n.t("simulate.drill.title")}</Text>
            <Text variant="caption" color="muted" style={{ marginTop: 4 }}>{i18n.t("simulate.drill.body")}</Text>

            {drillState === "running" ? (
              <View style={{ flexDirection: "row", marginTop: 10 }}>
                <Chip kind="brand" label={i18n.t("simulate.drill.practice")} dot testID="sim-practice-banner" />
              </View>
            ) : null}

            {drillState === "running" ? (
              <View style={{ marginTop: 10, gap: 4 }} testID="sim-step-list">
                {drillScript.map((_, i) => (
                  <Text key={i} variant="caption" color={i <= step ? "primary" : "faint"} testID={`sim-step-${i}`}>
                    {i <= step ? "✓ " : "• "}{i18n.t(`simulate.drill.step${i}`)}
                  </Text>
                ))}
              </View>
            ) : null}

            {drillState === "done" ? (
              <View style={{ marginTop: 10, gap: 4 }} testID="sim-result">
                <Text variant="bodyStrong" color={d.chip.brand.fg}>{i18n.t("simulate.drill.score", { score })}</Text>
                <Text variant="caption" color="muted">{i18n.t(score >= 100 ? "simulate.drill.tipPerfect" : "simulate.drill.tip")}</Text>
              </View>
            ) : null}

            <View style={{ marginTop: 12 }}>
              <Button3D
                variant="ghost"
                label={i18n.t(drillState === "running" ? "simulate.drill.running" : drillState === "done" ? "simulate.drill.again" : "simulate.drill.start")}
                onPress={startDrill}
                disabled={drillState === "running"}
                testID="sim-drill-start"
              />
            </View>
          </Card>

          {/* Card 2 — fake live stream */}
          <Card variant="raised" testID="sim-card-live">
            <Illustration name="simulate-golive" size={56} style={{ marginBottom: 8 }} />
            <Text variant="bodyStrong">{i18n.t("simulate.live.title")}</Text>
            <Text variant="caption" color="muted" style={{ marginTop: 4 }}>{i18n.t("simulate.live.body")}</Text>
            <View style={{ marginTop: 12 }}>
              <Button3D variant="ghost" label={i18n.t("simulate.live.cta")} onPress={() => { void events.log("golive_started", {}); setLive(true); }} testID="sim-live-start" />
            </View>
          </Card>

          {/* Card 3 — WhatsApp video call to a guardian */}
          <Card variant="raised" testID="sim-card-call">
            <Illustration name="simulate-videocall" size={56} style={{ marginBottom: 8 }} />
            <Text variant="bodyStrong">{i18n.t("simulate.call.title")}</Text>
            <Text variant="caption" color="muted" style={{ marginTop: 4 }}>{i18n.t("simulate.call.body")}</Text>
            <View style={{ marginTop: 12 }}>
              <Button3D variant="ghost" label={i18n.t("simulate.call.cta")} onPress={callGuardian} disabled={!primaryPhone} testID="sim-call-start" />
            </View>
            {!primaryPhone ? <Text variant="caption" color="faint" style={{ marginTop: 6 }}>{i18n.t("simulate.call.none")}</Text> : null}
          </Card>
        </TourTarget>
      </ScrollView>

      <FakeLiveStream visible={live} onClose={() => setLive(false)} />
    </View>
  );
}
