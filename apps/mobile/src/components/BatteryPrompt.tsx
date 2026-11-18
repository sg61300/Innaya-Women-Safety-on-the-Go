import { useEffect } from "react";
import { View } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { Card } from "./Card";
import { Button3D } from "./Button3D";
import { useJourney } from "../store/journey";
import i18n from "../i18n";

// ADR-042 / R47d: a non-blocking low-battery charge nudge, raised once per downward
// 20 %/10 % crossing during a journey (see location.batteryStep). It is NEVER a
// challenge and NEVER a siren — just a haptic and a dismissible card. Monitoring
// keeps running (in lite mode). Mounted once in (user)/_layout.
export function BatteryPrompt() {
  const { p } = useTheme();
  const prompt = useJourney((s) => s.batteryPrompt);

  useEffect(() => {
    if (prompt) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [prompt?.pct]);

  if (!prompt) return null;
  return (
    <View
      testID="battery-prompt"
      pointerEvents="box-none"
      style={{ position: "absolute", left: 12, right: 12, bottom: 96 }}
    >
      <Card style={{ gap: 12, borderColor: p.brand }}>
        <Text variant="bodyStrong" color="primary">
          {i18n.t("battery.lowTitle")}
        </Text>
        <Text variant="body" color="muted" testID="battery-prompt-body">
          {i18n.t("battery.low", { n: prompt.pct })}
        </Text>
        <Button3D
          full
          label={i18n.t("battery.continue")}
          testID="battery-prompt-continue"
          onPress={() => useJourney.getState().set({ batteryPrompt: null })}
        />
      </Card>
    </View>
  );
}
