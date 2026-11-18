import { useEffect, useRef, useState } from "react";
import { Modal, View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { Button3D } from "./Button3D";
import i18n from "../i18n";
import { SOS_MODE_CHOICE_MS, type AlarmMode } from "@vaira/core";

// ADR-043 item 1 — the SOS mode choice sheet. Opens on the wearer's own SOS tap
// AFTER guardians are already alerted (the SOS event with a provisional `mode:
// "siren"` went out at the tap). The wearer picks Siren or Silent; if nothing is
// chosen within SOS_MODE_CHOICE_MS (10 s) the sheet auto-selects Siren. It owns
// no protocol logic beyond that single choice — the parent wires onChoose to the
// runner (a Silent pick sends the SOS_MODE follow-up within the 10 s window).
export function SosModeSheet({ visible, onChoose }: { visible: boolean; onChoose: (mode: AlarmMode) => void }) {
  const { p } = useTheme();
  const total = Math.round(SOS_MODE_CHOICE_MS / 1000);
  const [secondsLeft, setSecondsLeft] = useState(total);
  const chosen = useRef(false);

  useEffect(() => {
    if (!visible) return;
    chosen.current = false;
    setSecondsLeft(total);
    const startedAt = Date.now();
    const tick = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((SOS_MODE_CHOICE_MS - (Date.now() - startedAt)) / 1000)));
    }, 250);
    const auto = setTimeout(() => {
      if (!chosen.current) {
        chosen.current = true;
        onChoose("siren"); // no choice in the window → Siren, per §1 rule 2
      }
    }, SOS_MODE_CHOICE_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(auto);
    };
    // onChoose/total are stable for a given open; re-running on `visible` only is
    // intentional so the 10 s window is not restarted by unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const choose = (mode: AlarmMode) => {
    if (chosen.current) return; // a second tap (or a tap after auto-siren) is ignored
    chosen.current = true;
    onChoose(mode);
  };

  if (!visible) return null;

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={() => {}} testID="sos-mode-sheet">
      <View style={{ flex: 1, backgroundColor: p.brandSoft, alignItems: "center", justifyContent: "center", padding: 24, gap: 18 }}>
        <Text variant="display" testID="sos-mode-title">{i18n.t("sosMode.title")}</Text>
        <Text variant="body" color={p.textMuted}>{i18n.t("sosMode.body")}</Text>
        <View style={{ alignSelf: "stretch", gap: 6 }}>
          <Button3D label={i18n.t("sosMode.sirenLabel")} onPress={() => choose("siren")} full testID="sos-mode-siren" />
          <Text variant="caption" color={p.textMuted}>{i18n.t("sosMode.sirenSub")}</Text>
        </View>
        <View style={{ alignSelf: "stretch", gap: 6 }}>
          <Button3D label={i18n.t("sosMode.silentLabel")} onPress={() => choose("silent")} variant="ghost" full testID="sos-mode-silent" />
          <Text variant="caption" color={p.textMuted}>{i18n.t("sosMode.silentSub")}</Text>
        </View>
        <Text variant="caption" color={p.textMuted} testID="sos-mode-autohint">{i18n.t("sosMode.autoHint", { n: secondsLeft })}</Text>
      </View>
    </Modal>
  );
}
