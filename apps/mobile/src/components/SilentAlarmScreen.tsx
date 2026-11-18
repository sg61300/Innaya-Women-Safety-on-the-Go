import { View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { Button3D } from "./Button3D";
import i18n from "../i18n";

// ADR-043 item 3 — the wearer's silent-alert screen. Founder rule: "dont hide
// the flow". It is CALM: no alarm colours, no siren, no red. It states the silent
// alert is running, how many guardians were told, and carries a VISIBLE
// "Not an emergency" button that opens the cancel flow. Pressing SOS again (the
// footer button, unchanged) switches to Siren mode — surfaced only as a hint here.
export function SilentAlarmScreen({ guardianCount, onNotEmergency }: { guardianCount: number; onNotEmergency: () => void }) {
  const { p } = useTheme();
  return (
    <View
      testID="silent-alarm-screen"
      style={{ flex: 1, backgroundColor: p.brandSoft, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}
    >
      <Text variant="display" testID="silent-title">{i18n.t("silent.title")}</Text>
      <Text variant="bodyStrong" testID="silent-guardians">{i18n.t("silent.guardians", { n: guardianCount })}</Text>
      <Text variant="body" color={p.textMuted} style={{ textAlign: "center" }}>{i18n.t("silent.sub")}</Text>
      <View style={{ alignSelf: "stretch", gap: 12 }}>
        <Button3D label={i18n.t("silent.notEmergency")} onPress={onNotEmergency} full testID="silent-not-emergency" />
      </View>
      <Text variant="caption" color={p.textMuted} style={{ textAlign: "center" }}>{i18n.t("silent.switchHint")}</Text>
    </View>
  );
}
