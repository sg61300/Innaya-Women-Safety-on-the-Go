import { Pressable } from "react-native";
import { useTheme } from "../theme";
import type { Button3DIcon } from "./Button3D";

export function IconButton({ icon: Icon, onPress, label, size = 34, testID, disabled, tint, bg }: {
  icon: Button3DIcon; onPress: () => void; label: string; size?: number; testID?: string; disabled?: boolean;
  // b14: optional overrides so the same control can sit on a gradient band
  // (white glyph on a translucent-white chip) as well as on the page.
  tint?: string; bg?: string;
}) {
  const { p } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
      testID={testID} onPress={onPress} disabled={disabled} hitSlop={Math.max(0, (44 - size) / 2)}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: 12, backgroundColor: bg ?? p.brandSoft, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}>
      <Icon size={Math.round(size * 0.55)} color={tint ?? p.brand} strokeWidth={2.2} />
    </Pressable>
  );
}
