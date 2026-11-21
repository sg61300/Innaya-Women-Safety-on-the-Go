import { useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Button3D } from "../../src/components/Button3D";
import { Chip } from "../../src/components/Chip";
import { Card } from "../../src/components/Card";
import { VoiceFab } from "../../src/components/VoiceFab";
import { GuardianRing } from "../../src/components/GuardianRing";
import { CityPicker } from "../../src/components/CityPicker";
import { SafeWordStrength } from "../../src/components/SafeWordStrength";
import { AreYouSafeLayout } from "../../src/components/AreYouSafeLayout";
import { EmergencyLayout } from "../../src/components/EmergencyLayout";
import { useTheme, PALETTE_META, type PaletteKey, type ChipKind } from "../../src/theme";
import type { RingState } from "../../src/components/GuardianRing";
import type { CityKey } from "../../src/lib/cities";
import type { Variant } from "../../src/theme/typography";

const emblem = require("../../assets/brand/emblem.png");
const noop = () => {};
const VARIANTS: Variant[] = ["display", "title", "subtitle", "body", "bodyStrong", "caption", "label", "chip", "numeral"];
const CHIPS: { kind: ChipKind; label: string }[] = [
  { kind: "safe", label: "JOURNEY ACTIVE · SAFE" },
  { kind: "amber", label: "Approaching amber zone" },
  { kind: "danger", label: "SOS armed" },
  { kind: "critical", label: "No signal" },
  { kind: "brand", label: "Guardian" },
  { kind: "neutral", label: "Idle" },
];
const RINGS: RingState[] = ["idle", "safe", "amber", "emergency", "critical"];
const EMERGENCY_ITEMS = [
  { label: "Guardians notified", done: true, detail: "Amma, Deepa" },
  { label: "Location shared", done: true },
  { label: "Nearby app users alerted", done: true },
  { label: "Live feed on", done: false },
  { label: "Siren on", done: true },
];

function CityPickerDemo() {
  const [city, setCity] = useState<CityKey>("bengaluru");
  return <CityPicker value={city} onChange={setCity} />;
}

function AreYouSafeDemo() {
  const [typed, setTyped] = useState("");
  return (
    <View style={{ height: 560, borderRadius: 20, overflow: "hidden" }}>
      <AreYouSafeLayout seconds={4} total={5} typed={typed} onTyped={setTyped} onSafe={noop} onDanger={noop} speakerPromptFired />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 24, gap: 12 }}>
      <Text variant="label" color="faint">{title}</Text>
      {children}
    </View>
  );
}

// Dev-only visual gallery. Reached via vaira://gallery?palette=<key>; sets the
// palette from the param on mount so the screenshot script can cycle all eight.
// ?screen=<route> redirects after setting the palette (used by C3).
export default function Gallery() {
  const { setPalette } = useTheme();
  const params = useLocalSearchParams<{ palette?: string; screen?: string }>();
  const router = useRouter();
  const key = params.palette as PaletteKey | undefined;
  useEffect(() => {
    if (key && PALETTE_META[key]) setPalette(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (params.screen) router.replace(params.screen as Parameters<typeof router.replace>[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.screen]);

  if (!__DEV__) return null;
  const label = (key && PALETTE_META[key]?.label) || key || "system";

  return (
    <Screen scroll padded topInset={false}>
      <View style={{ marginTop: 16 }}>
        <Text variant="display">INNAYA kit</Text>
        <Text variant="subtitle" color="muted">Palette: {label}</Text>
      </View>

      <Section title="TYPE SCALE">
        {VARIANTS.map((v) => <Text key={v} variant={v}>{v}</Text>)}
      </Section>

      <Section title="BUTTONS">
        <Button3D label="Start journey" onPress={noop} full />
        <Button3D label="Add guardian" variant="ghost" onPress={noop} full />
        <Button3D label="SOS" variant="danger" onPress={noop} full />
        <Button3D label="Fake call" variant="pill" onPress={noop} />
        <Button3D label="Disabled" onPress={noop} disabled full />
        <Button3D label="Loading" onPress={noop} loading full />
      </Section>

      <Section title="CHIPS">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {CHIPS.map((c) => <Chip key={c.kind} kind={c.kind} label={c.label} dot />)}
        </View>
      </Section>

      <Section title="GUARDIAN RING">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
          {RINGS.map((s) => <GuardianRing key={s} state={s} guardians={3} emblem={emblem} size={150} />)}
        </View>
      </Section>

      <Section title="VOICE FAB (idle / listening)">
        <View style={{ flexDirection: "row" }}>
          <View style={{ width: 84, height: 160 }}><VoiceFab listening={false} onToggle={noop} /></View>
          <View style={{ width: 84, height: 160 }}><VoiceFab listening onToggle={noop} /></View>
        </View>
      </Section>

      <Section title="CARD">
        <Card>
          <Text variant="bodyStrong">On your way home</Text>
          <Text variant="caption" color="muted">3 guardians watching · ETA 18 min</Text>
        </Card>
      </Section>

      <Section title="CITY PICKER (GPS detect + regions chip)">
        <CityPickerDemo />
      </Section>

      <Section title="SAFE-WORD STRENGTH (weak / ok / strong)">
        <SafeWordStrength word="ok" />
        <SafeWordStrength word="violet" />
        <SafeWordStrength word="purple mountain" />
      </Section>

      <Section title="ARE-YOU-SAFE LAYOUT">
        <AreYouSafeDemo />
      </Section>

      <Section title="EMERGENCY / CRITICAL LAYOUT">
        <View style={{ height: 520, borderRadius: 20, overflow: "hidden" }}>
          <EmergencyLayout state="CRITICAL" elapsedS={63} items={EMERGENCY_ITEMS} onCancelPress={noop} />
        </View>
        <View style={{ height: 520, borderRadius: 20, overflow: "hidden" }}>
          <EmergencyLayout state="EMERGENCY" elapsedS={12} items={EMERGENCY_ITEMS} onCancelPress={noop} />
        </View>
      </Section>
    </Screen>
  );
}
