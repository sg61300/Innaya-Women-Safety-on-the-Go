import { useEffect, useState } from "react";
import { View, ScrollView, Pressable, Linking } from "react-native";
import { useTheme } from "../../src/theme";
import { Text } from "../../src/components/Text";
import { Card } from "../../src/components/Card";
import { Chip } from "../../src/components/Chip";
import { Button3D } from "../../src/components/Button3D";
import { Illustration, type IllustrationName } from "../../src/components/Illustration";
import { MotionIllustration } from "../../src/components/MotionIllustration";
import { useMotionActive } from "../../src/lib/useMotionActive";
import { GradientBand, BAND_INK } from "../../src/components/GradientBand";
import { defence, type DefenceClass } from "../../src/services/defence";
import { links } from "../../src/lib/links";
import { events } from "../../src/lib/events";
import i18n from "../../src/i18n";

type Tab = "classes" | "tools";

// Map a tool name to its illustration slot (emblem fallback until the file lands).
const toolIcon = (name: string): IllustrationName =>
  /pepper/i.test(name) ? "tool-pepper-spray"
    : /alarm/i.test(name) ? "tool-personal-alarm"
      : /whistle/i.test(name) ? "tool-whistle"
        : "tool-safety-phone";

// Segmented Classes / Tools switch (amendment: Card list, no hero).
function TabButton({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID: string }) {
  const { p, d } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{ flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: active ? d.chip.brand.bg : "transparent" }}
    >
      <Text variant="label" color={active ? d.chip.brand.fg : "muted"}>{label}</Text>
    </Pressable>
  );
}

export default function DefenceScreen() {
  const { p, d } = useTheme();
  const [tab, setTab] = useState<Tab>("classes");
  const [origin, setOrigin] = useState({ lat: 28.6139, lng: 77.209 });
  // Seed the list synchronously from the default origin so the Classes tab is
  // never empty on first open; the effect below refines distances once the real
  // location resolves. (b16 F1: list used to appear only after a tab switch.)
  const [classes, setClasses] = useState<(DefenceClass & { distanceM: number })[]>(() => defence.classes(28.6139, 77.209));

  // classes_opened / tools_opened: the Classes tab is the default open, so it is
  // logged on mount; a tab switch logs the tab the user moves to. These are the
  // M4 (tools) and M5 (classes) denominators.
  useEffect(() => { void events.log("classes_opened", {}); }, []);
  function switchTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    void events.log(next === "tools" ? "tools_opened" : "classes_opened", {});
  }

  useEffect(() => {
    (async () => {
      let o = origin;
      try {
        const Location = require("expo-location");
        const pos = await Location.getCurrentPositionAsync({});
        o = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOrigin(o);
      } catch (e) { console.warn("[defence] location failed", e); }
      setClasses(defence.classes(o.lat, o.lng));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tools = defence.tools();
  const motionActive = useMotionActive(); // tool motions run only while Defence is visible + reduce-motion off

  return (
    <View style={{ flex: 1, backgroundColor: p.bgBase }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 12 }} testID="defence-scroll">
        {/* b14: hero illustration on a plum gradient band with the serif title. */}
        <GradientBand style={{ alignItems: "center", paddingVertical: 22, paddingHorizontal: 16, borderRadius: 24 }} testID="defence-hero-band">
          <Illustration name="selfdefence-hero" size={128} testID="defence-hero" />
          <Text variant="titleSerif" color={BAND_INK} style={{ marginTop: 10, textAlign: "center" }}>{i18n.t("defence.title")}</Text>
        </GradientBand>

        <View style={{ flexDirection: "row", gap: 4, padding: 4, borderRadius: 14, backgroundColor: d.card.bg, borderWidth: 1, borderColor: d.card.border }}>
          <TabButton testID="defence-tab-classes" label={i18n.t("defence.classes")} active={tab === "classes"} onPress={() => switchTab("classes")} />
          <TabButton testID="defence-tab-tools" label={i18n.t("defence.tools")} active={tab === "tools"} onPress={() => switchTab("tools")} />
        </View>

        {tab === "classes"
          ? classes.map((c, i) => (
              <Card variant="raised" key={c.name} testID={`class-row-${i}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Illustration name="class-selfdefence" size={44} />
                  <Text variant="bodyStrong" style={{ flex: 1 }}>{c.name}</Text>
                  {c.partner ? <Chip kind="brand" label={i18n.t("defence.partner", { pct: c.discountPct ?? 0 })} /> : null}
                </View>
                <Text variant="caption" color="muted" style={{ marginTop: 4 }}>{i18n.t("defence.distanceKm", { km: (c.distanceM / 1000).toFixed(1) })}</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <Button3D variant="ghost" label={i18n.t("defence.call")} onPress={() => { void events.log("class_card_selected", { name: c.name, action: "call" }); void events.log("class_call_clicked", { name: c.name }); Linking.openURL(links.tel(c.phone)).catch(() => {}); }} testID={`class-call-${i}`} />
                  <Button3D variant="ghost" label={i18n.t("defence.directions")} onPress={() => { void events.log("class_card_selected", { name: c.name, action: "map" }); void events.log("class_map_clicked", { name: c.name }); Linking.openURL(`https://maps.google.com/?daddr=${c.lat},${c.lng}`).catch(() => {}); }} testID={`class-directions-${i}`} />
                </View>
              </Card>
            ))
          : tools.map((t, i) => (
              <Card variant="raised" key={t.name} testID={`tool-row-${i}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  {(() => {
                    const icon = toolIcon(t.name);
                    // P16 safety phone breathes; P14 personal alarm gets a pulsing
                    // ring of light; other tools stay static.
                    if (icon === "tool-safety-phone") return <MotionIllustration name={icon} size={48} variant="breathe" active={motionActive} />;
                    if (icon === "tool-personal-alarm") return <MotionIllustration name={icon} size={48} variant="pulse" active={motionActive} />;
                    return <Illustration name={icon} size={48} />;
                  })()}
                  <Text variant="bodyStrong" style={{ flex: 1 }}>{t.name}</Text>
                  <Chip kind={t.legal === "restricted" ? "critical" : "safe"} label={i18n.t(`defence.${t.legal}`)} />
                </View>
                {t.note ? <Text variant="caption" color="faint" style={{ marginTop: 4 }}>{t.note}</Text> : null}
                <View style={{ marginTop: 10, alignSelf: "flex-start" }}>
                  <Button3D variant="ghost" label={i18n.t("defence.buy")} onPress={() => { void events.log("tool_clicked", { name: t.name, legal: t.legal }); Linking.openURL(t.amazonUrl).catch(() => {}); }} testID={`tool-buy-${i}`} />
                </View>
              </Card>
            ))}

        <Text testID="defence-disclaimer" variant="caption" color="faint" style={{ marginTop: 8 }}>{i18n.t("defence.disclaimer")}</Text>
      </ScrollView>
    </View>
  );
}
