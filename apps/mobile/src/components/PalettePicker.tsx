import { View, Pressable, ScrollView } from "react-native";
import { useTheme, PALETTE_ORDER, PALETTE_META, isDarkPalette, type PaletteKey } from "../theme";
import { Text } from "./Text";
import { Chip } from "./Chip";
import i18n from "../i18n";

// Two-colour swatch circle (PALETTE_META[k].swatch = [start, end]).
function Swatch({ colors }: { colors: readonly [string, string] }) {
  return (
    <View style={{ width: 30, height: 30, borderRadius: 15, overflow: "hidden", flexDirection: "row" }}>
      <View style={{ flex: 1, backgroundColor: colors[0] }} />
      <View style={{ flex: 1, backgroundColor: colors[1] }} />
    </View>
  );
}

function Row({
  label, selected, onPress, swatch, dark, testID,
}: {
  label: string; selected: boolean; onPress: () => void;
  swatch?: readonly [string, string]; dark?: boolean; testID?: string;
}) {
  const { p, d } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", gap: 12,
        paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14,
        backgroundColor: selected ? p.brandSoft : pressed ? d.card.bg : "transparent",
        minHeight: 48,
      })}
    >
      {swatch ? <Swatch colors={swatch} /> : <View style={{ width: 30 }} />}
      <Text variant="body" style={{ flex: 1 }}>{label}</Text>
      {dark ? <Chip kind="neutral" label={i18n.t("appearance.dark")} /> : null}
      {selected ? <Text variant="bodyStrong" color={p.brand}>✓</Text> : null}
    </Pressable>
  );
}

// Live-preview palette picker (V12). Reuses the merged theme system: tapping a
// row calls setPalette immediately; ThemeProvider persists the choice and logs
// "[theme] palette". Rendered as a self-contained bottom-sheet overlay so the
// host screen only mounts/unmounts it.
export function PalettePicker({ onClose }: { onClose: () => void }) {
  const { p, d, choice, setPalette } = useTheme();
  return (
    <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "flex-end" }} testID="palette-picker">
      <Pressable
        accessibilityLabel={i18n.t("appearance.close")}
        testID="palette-backdrop"
        onPress={onClose}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" }}
      />
      <View style={{ backgroundColor: p.bgRaised, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 28, maxHeight: "80%" }}>
        <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: d.card.border, marginBottom: 12 }} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 4 }}>
          <Text variant="subtitle">{i18n.t("appearance.title")}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={i18n.t("appearance.done")} testID="palette-done" onPress={onClose} hitSlop={12}>
            <Text variant="bodyStrong" color={p.brand}>{i18n.t("appearance.done")}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 8 }}>
          <Row
            label={i18n.t("appearance.followSystem")}
            selected={choice === "system"}
            onPress={() => setPalette("system")}
            testID="palette-system"
          />
          {PALETTE_ORDER.map((k: PaletteKey) => (
            <Row
              key={k}
              label={PALETTE_META[k].label}
              swatch={PALETTE_META[k].swatch}
              dark={isDarkPalette(k)}
              selected={choice === k}
              onPress={() => setPalette(k)}
              testID={`palette-${k}`}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
