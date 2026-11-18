import { useEffect, useRef, useState } from "react";
import { View, Pressable } from "react-native";
import { useTheme } from "../theme";
import { Card } from "./Card";
import { Text } from "./Text";
import { Button3D } from "./Button3D";
import { vitals, type VitalsSource } from "../services/vitals";
import { demoSample, vitalsLabel, DEMO_SCENARIOS, type DemoScenario } from "../services/vitalsSimulated";
import { runner } from "../services/protocolRunner";
import { useJourney } from "../store/journey";
import i18n from "../i18n";

type SourceName = VitalsSource["name"];

// Only sources with a real native data path are selectable. BLE, Health Connect,
// and the pendant are intentionally visible but disabled until their native
// integrations exist; a selectable source that can never emit samples is
// misleading in a safety screen. Demo scenarios are development-only because
// they must never look like real sensor data in a release build.
const SOURCES: { name: SourceName; labelKey: string; enabled: boolean }[] = [
  { name: "ble", labelKey: "vitals.sourceBlePending", enabled: false },
  { name: "health_connect", labelKey: "vitals.sourceHealthPending", enabled: false },
  { name: "simulated", labelKey: "vitals.sourceSimulated", enabled: __DEV__ },
  { name: "pendant", labelKey: "vitals.sourcePendant", enabled: false },
];

const DEMO_STEP_MS = 2000; // founder spec: update every 2 s

function Tile({ label, value, unit }: { label: string; value: string; unit: string }) {
  const { d } = useTheme();
  return (
    <View
      style={{
        flexGrow: 1, flexBasis: "45%", minWidth: 130, padding: 14, borderRadius: 16,
        borderWidth: 1, borderColor: d.card.border, gap: 4,
      }}
    >
      <Text variant="caption" color="muted">{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
        <Text variant="subtitle">{value}</Text>
        <Text variant="caption" color="muted">{unit}</Text>
      </View>
    </View>
  );
}

// Task 34 / 24b — Vitals tab. Four tiles (HR, SpO₂, Breathing, HRV) read from the
// journey store's latest sample; "—" until a source reports. The Source radio is
// wired to vitals.select (Task 24b); BLE / Health Connect / Demo reveal extra
// controls per source (b16 F9 / F14).
export function VitalsTab() {
  const { p, d } = useTheme();
  const sample = useJourney((s) => s.vitals);
  const [selected, setSelected] = useState<SourceName | null>(null);
  const [scenario, setScenario] = useState<DemoScenario | null>(null);
  const demoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const hr = sample?.hr != null ? String(Math.round(sample.hr)) : "—";
  const hrv = sample?.hrv != null ? String(Math.round(sample.hrv)) : "—";
  const spo2 = sample?.spo2 != null ? String(Math.round(sample.spo2)) : "—";
  const breathing = sample?.breathing != null ? String(Math.round(sample.breathing)) : "—";

  const stopDemo = () => {
    if (demoTimer.current) { clearInterval(demoTimer.current); demoTimer.current = null; }
  };

  // F14: the Demo feed. On each tick write a full profile sample to the store so
  // the tiles animate; when a journey is armed and the sample reads as panic,
  // raise the same vitals stress score the real source would, so the demo proves
  // the end-to-end path.
  useEffect(() => {
    stopDemo();
    if (!scenario) return;
    const tick = () => {
      const s = demoSample(scenario);
      useJourney.getState().set({ vitals: s });
      if (useJourney.getState().journey && vitalsLabel(s.hr) === "panic") {
        void runner.send({ type: "SCORE", score: 1, reasons: ["vitals_stress"] });
      }
    };
    tick(); // show a value immediately
    demoTimer.current = setInterval(tick, DEMO_STEP_MS);
    return stopDemo;
  }, [scenario]);

  useEffect(() => stopDemo, []);

  const pick = async (name: SourceName) => {
    setSelected(name);
    if (name !== "simulated") { setScenario(null); stopDemo(); }
    try {
      await vitals.select(name);
    } catch {
      /* select is best-effort; UI selection stands */
    }
  };

  const label = sample?.hr != null && selected === "simulated" ? vitalsLabel(sample.hr) : null;

  return (
    <View style={{ gap: 16 }} testID="vitals-tab">
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <Tile label={i18n.t("vitals.hr")} value={hr} unit={i18n.t("vitals.bpm")} />
          <Tile label={i18n.t("vitals.spo2")} value={spo2} unit="%" />
          <Tile label={i18n.t("vitals.breathing")} value={breathing} unit={i18n.t("vitals.rpm")} />
          <Tile label={i18n.t("vitals.hrv")} value={hrv} unit={i18n.t("vitals.ms")} />
        </View>
        {label ? (
          <Text testID="vitals-demo-label" variant="bodyStrong" color={label === "calm" ? p.stateSafe : label === "panic" ? p.stateDanger : p.stateWatch} style={{ marginTop: 12 }}>
            {i18n.t(`vitals.demoLabel.${label}`)}
          </Text>
        ) : null}
      </Card>

      <Card style={{ gap: 6 }}>
        <Text variant="subtitle">{i18n.t("vitals.sourceTitle")}</Text>
        {SOURCES.map((s) => {
          const active = selected === s.name;
          return (
            <Pressable
              key={s.name}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: !s.enabled }}
              accessibilityLabel={i18n.t(s.labelKey)}
              testID={`vitals-source-${s.name}`}
              disabled={!s.enabled}
              onPress={() => pick(s.name)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, opacity: s.enabled ? 1 : 0.4 }}
            >
              <View
                style={{
                  width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                  borderColor: active ? p.brand : d.card.border, alignItems: "center", justifyContent: "center",
                }}
              >
                {active ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.brand }} /> : null}
              </View>
              <Text variant="body" color={s.enabled ? undefined : "muted"}>{i18n.t(s.labelKey)}</Text>
            </Pressable>
          );
        })}

        {/* F14: demo scenario chips */}
        {selected === "simulated" ? (
          <View testID="vitals-demo-scenarios" style={{ marginTop: 8, gap: 8 }}>
            <Text variant="caption" color="muted">{i18n.t("vitals.demoHint")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {DEMO_SCENARIOS.map((sc) => {
                const on = scenario === sc;
                return (
                  <Pressable
                    key={sc}
                    testID={`vitals-scenario-${sc}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={i18n.t(`vitals.scenario.${sc}`)}
                    onPress={() => setScenario(on ? null : sc)}
                    style={{ minHeight: 44, justifyContent: "center", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? d.chip.brand.bg : "transparent", borderWidth: 1, borderColor: on ? "transparent" : p.border }}
                  >
                    <Text variant="label" color={on ? d.chip.brand.fg : "muted"}>{i18n.t(`vitals.scenario.${sc}`)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {!__DEV__ ? <Text testID="vitals-release-note" variant="caption" color="muted">{i18n.t("vitals.releaseNote")}</Text> : null}
      </Card>
    </View>
  );
}
