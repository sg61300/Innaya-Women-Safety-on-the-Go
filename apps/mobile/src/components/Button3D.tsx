import { type ComponentType, useState } from "react";
import { Pressable, View, ActivityIndicator } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../theme";
import { Text } from "./Text";

type Variant = "primary" | "ghost" | "danger" | "pill";
export type Button3DIcon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

// R-BTN 2026-09-04: primary faces use the DERIVED gradient tokens (d.btn.*),
// which carry the WCAG guarantee. Never p.btnStart/Mid/End.
export function Button3D({
  label, onPress, variant = "primary", icon: Icon, disabled, loading, full, color, testID,
}: {
  label: string; onPress: () => void; variant?: Variant; icon?: Button3DIcon;
  disabled?: boolean; loading?: boolean; full?: boolean; color?: string; testID?: string;
}) {
  const { p, d } = useTheme();
  const [pressed, setPressed] = useState(false);
  // s25 direction A: flat pill (height 52, radius 26), no edge/lift layer, no hard
  // shadow. Founder ruling 2026-09-26: primary keeps the EXACT rose-gold fill
  // (d.btn.mid = #C6997A), pressed = d.btn.deep (#B4886B); the label + icon are
  // ink-plum (d.btn.label) — never white on the rose-gold. Danger keeps white on red.
  const primaryFace = pressed ? d.btn.deep : d.btn.mid;
  const face = variant === "primary" ? primaryFace : variant === "danger" ? d.sos : variant === "pill" ? (color ?? p.brand) : "transparent";
  // ghost (secondary) text is the plum accent on a rose-gold outline; primary uses the AA-chosen ink label.
  const fg = variant === "ghost" ? p.brand : variant === "primary" ? d.btn.label : d.onPrimary;
  const blocked = disabled || loading;
  return (
    // Disabled = 45% opacity solid (not a dead gradient).
    <View testID={testID ? `${testID}-wrap` : undefined} style={{ alignSelf: full ? "stretch" : "flex-start", opacity: disabled ? 0.45 : 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled, busy: !!loading }}
        testID={testID}
        disabled={blocked}
        onPressIn={() => { setPressed(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
        onPressOut={() => { setPressed(false); }}
        onPress={() => { if (!blocked) onPress(); }}
        style={[{
          minHeight: variant === "pill" ? 46 : 52, paddingHorizontal: 24, borderRadius: 26,
          backgroundColor: face, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
          borderWidth: variant === "ghost" ? 1.5 : 0, borderColor: p.rose,
        }]}
      >
        {loading
          ? <ActivityIndicator color={fg} />
          : <>{Icon ? <Icon size={18} color={fg} strokeWidth={2.2} /> : null}<Text variant="bodyStrong" color={fg} style={{ flexShrink: 1, textAlign: "center" }}>{label}</Text></>}
      </Pressable>
    </View>
  );
}
