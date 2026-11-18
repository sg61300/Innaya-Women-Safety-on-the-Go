import { View, Pressable, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";
import i18n from "../i18n";

export type SensorName = "camera" | "voice" | "vitals" | "gps";

export function SensorPill({
  sensor,
  on,
  degraded,
  paused,
  lite,
  onPress,
  testID,
}: {
  sensor: SensorName;
  on: boolean;
  degraded?: boolean;
  paused?: boolean;
  // ADR-042/R47d: when set, a camera pill reads "Lite mode · N %" (low-battery throttle).
  lite?: number | null;
  onPress?: () => void;
  testID?: string;
}) {
  const { p, d } = useTheme();
  // ADR-038: a paused camera pill shows only "Camera off" in the neutral/off
  // outline, overriding on/degraded.
  const label = paused
    ? i18n.t("sensor.cameraOff")
    : lite != null
      ? i18n.t("battery.lite", { n: lite })
      : i18n.t(`sensor.${sensor}`);

  // paused → neutral off outline; else degraded wins over on/off (on → filled
  // safe; off → hollow outline).
  const fg = paused ? p.textMuted : degraded ? d.chip.amber.fg : on ? d.chip.safe.fg : p.textMuted;
  const box: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignSelf: "flex-start",
    backgroundColor: paused ? "transparent" : degraded ? d.chip.amber.bg : on ? d.chip.safe.bg : "transparent",
    borderWidth: paused ? 1 : on || degraded ? 0 : 1,
    borderColor: p.border,
  };
  const dot = { width: 8, height: 8, borderRadius: 4, backgroundColor: fg } as const;
  const state = paused ? "paused" : degraded ? "degraded" : on ? "on" : "off";
  const tid = testID ?? `sensor-pill-${sensor}`;
  const content = (
    <>
      <View style={dot} />
      <Text variant="label" color={fg}>
        {label}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        testID={tid}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${state}`}
        accessibilityState={{ disabled: false }}
        onPress={onPress}
        style={({ pressed }) => [box, pressed && { opacity: 0.6 }]}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View testID={tid} accessibilityRole="text" accessibilityLabel={`${label}, ${state}`} style={box}>
      {content}
    </View>
  );
}
