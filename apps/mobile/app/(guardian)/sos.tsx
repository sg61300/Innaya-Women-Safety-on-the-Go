import { useEffect, useRef, useState } from "react";
import { View, Modal, Linking } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Siren } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Card } from "../../src/components/Card";
import { Button3D } from "../../src/components/Button3D";
import { CountdownNumeral } from "../../src/components/CountdownRing";
import { useTheme } from "../../src/theme";
import { guardian, patchCountdown, type Trustee } from "../../src/services/guardian";
import { supabase } from "../../src/lib/supabase";
import { events } from "../../src/lib/events";
import i18n from "../../src/i18n";

type Stage = "idle" | "confirm" | "patch";
const PATCH_MS = 5000;

export default function GuardianSosScreen() {
  const { p } = useTheme();
  const params = useLocalSearchParams<{ journeyId?: string; name?: string }>();
  const [picked, setPicked] = useState<{ journeyId: string; name: string } | null>(
    params.journeyId ? { journeyId: String(params.journeyId), name: params.name ?? "her" } : null
  );
  const [candidates, setCandidates] = useState<Trustee[]>([]);
  const [stage, setStage] = useState<Stage>("idle");
  const [raiseErr, setRaiseErr] = useState(false);
  const [secs, setSecs] = useState(PATCH_MS / 1000);
  const cancelPatch = useRef<(() => void) | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (picked) return;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id;
      if (!uid) return;
      try {
        setCandidates((await guardian.trustees(uid)).filter((t) => t.journey));
      } catch {
        /* ignore */
      }
    })();
  }, [picked]);

  const clearPatch = () => {
    cancelPatch.current?.();
    cancelPatch.current = null;
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
  };
  useEffect(() => clearPatch, []);

  const dial112 = () => Linking.openURL("tel:112").catch(() => {});

  const confirmRaise = async () => {
    if (!picked) return;
    setRaiseErr(false);
    try {
      await guardian.raiseSos(picked.journeyId);
    } catch {
      // POST failed: warn the guardian but still walk them to the 112 path so
      // help is reached even when the alert never landed on the server.
      setRaiseErr(true);
    }
    setStage("patch");
    setSecs(PATCH_MS / 1000);
    ticker.current = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    cancelPatch.current = patchCountdown(
      () => {},
      () => {
        clearPatch();
        setStage("idle");
        dial112();
      },
      PATCH_MS
    );
  };

  const patchYes = () => {
    if (!picked) return;
    clearPatch();
    events.log("patch_request", {}, picked.journeyId);
    setStage("idle");
    dial112();
  };
  const patchNo = () => {
    clearPatch();
    setStage("idle");
    dial112();
  };

  return (
    <Screen scroll padded topInset={false} testID="guardian-sos-screen">
      <View style={{ gap: 16, paddingTop: 16 }}>
        {picked ? (
          <>
            <Text variant="title" color="primary">
              {i18n.t("guardian.sos.raiseFor", { name: picked.name })}
            </Text>
            <Button3D testID="sos-open" full variant="danger" icon={Siren} label={i18n.t("guardian.detail.raiseSos")} onPress={() => setStage("confirm")} />
            {raiseErr ? (
              <Text variant="bodyStrong" color={p.stateDanger} testID="sos-raise-error">{i18n.t("guardian.sos.raiseFailed")}</Text>
            ) : null}
            <Card style={{ gap: 6 }}>
              <Text variant="bodyStrong" color="primary">{i18n.t("guardian.sos.scriptTitle")}</Text>
              <Text variant="body" color="muted">{i18n.t("guardian.sos.script", { name: picked.name })}</Text>
            </Card>
          </>
        ) : (
          <>
            <Text variant="title" color="primary">{i18n.t("guardian.sos.pick")}</Text>
            {candidates.map((t) => (
              <Card key={t.contactId} testID={`sos-pick-${t.contactId}`} onPress={() => setPicked({ journeyId: t.journey!.id, name: t.name })}>
                <Text variant="bodyStrong" color="primary">{t.name}</Text>
              </Card>
            ))}
          </>
        )}
      </View>

      <Modal transparent visible={stage === "confirm"} animationType="fade" onRequestClose={() => setStage("idle")}>
        <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.5)" }}>
          <Card testID="sos-confirm" style={{ gap: 14 }}>
            <Text variant="title" color="primary">{i18n.t("guardian.sos.confirmTitle")}</Text>
            <Text variant="body" color="muted">{i18n.t("guardian.sos.confirmBody")}</Text>
            <Button3D testID="sos-confirm-yes" full variant="danger" label={i18n.t("guardian.sos.continue")} onPress={confirmRaise} />
            <Button3D testID="sos-confirm-cancel" full variant="ghost" label={i18n.t("guardian.sos.cancel")} onPress={() => setStage("idle")} />
          </Card>
        </View>
      </Modal>

      <Modal transparent visible={stage === "patch"} animationType="fade" onRequestClose={patchNo}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.5)" }}>
          <Card testID="sos-patch" style={{ gap: 14, alignItems: "center", alignSelf: "stretch" }}>
            <Text variant="title" color="primary">{i18n.t("guardian.sos.patchTitle")}</Text>
            <CountdownNumeral seconds={secs} total={PATCH_MS / 1000} />
            <Button3D testID="sos-patch-yes" full label={i18n.t("guardian.sos.patchYes")} onPress={patchYes} />
            <Button3D testID="sos-patch-no" full variant="ghost" label={i18n.t("guardian.sos.patchNo")} onPress={patchNo} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
