import { useState } from "react";
import { View, Switch } from "react-native";
import { router } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Card } from "../../src/components/Card";
import { Button3D } from "../../src/components/Button3D";
import { supabase } from "../../src/lib/supabase";
import { useSession } from "../../src/store/session";
import { events } from "../../src/lib/events";
import { TERMS_VERSION, TRAINING_PROMISES } from "../../src/data/terms";
import { useTheme } from "../../src/theme";
import i18n from "../../src/i18n";

// C7 training-data consent (ADR-015): a SEPARATE full-screen step, one large
// toggle UNTICKED by default, the three founder-mandated promises in large type.
export default function TrainingConsent() {
  const { p, d } = useTheme();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const { userId, profile, set } = useSession();

  async function cont() {
    if (busy) return;
    setBusy(true);
    setSaveErr(null);
    try {
      const at = new Date().toISOString();
      const { error } = await supabase
        .from("profiles")
        .update({ consent_c7_training: on, consent_c7_answered_at: at })
        .eq("id", userId);
      if (error) throw error;
      await events.log("consent_c7", { version: TERMS_VERSION, on });
      set({ profile: { ...(profile ?? {}), consent_c7_training: on, consent_c7_answered_at: at } });
      router.replace("/(user)/home");
    } catch (e) {
      setSaveErr(i18n.t("training.saveError"));
      console.warn("[training-consent] save failed", (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen
      scroll
      padded
      testID="training-consent-screen"
      header={
        // X3 (s25): the heading stays fixed while the promises/content scroll.
        <View style={{ paddingTop: 32, paddingBottom: 8 }}>
          <Text variant="display">{i18n.t("training.heading")}</Text>
        </View>
      }
    >
      <View style={{ paddingBottom: 8 }}>
        <Text variant="body" color="muted" style={{ marginTop: 12 }}>
          {i18n.t("training.intro")}
        </Text>

        <Card variant="raised" style={{ marginTop: 20 }}>
          {TRAINING_PROMISES.map((promise, i) => (
            <View
              key={promise}
              style={{ flexDirection: "row", marginTop: i === 0 ? 0 : 16 }}
            >
              <Text variant="subtitle" color={p.stateSafe} style={{ marginRight: 10 }}>
                ✓
              </Text>
              <Text variant="subtitle" style={{ flex: 1 }}>
                {promise}
              </Text>
            </View>
          ))}
        </Card>

        <Text variant="body" color="muted" style={{ marginTop: 16 }}>
          {i18n.t("training.optional")}
        </Text>

        {/* R4: was a bare View reproducing the Card base — now the real Card. */}
        <Card variant="raised" style={{ flexDirection: "row", alignItems: "center", marginTop: 24 }}>
          <Switch
            testID="training-toggle"
            accessibilityLabel={i18n.t("training.toggleLabel")}
            accessibilityRole="switch"
            value={on}
            onValueChange={setOn}
            trackColor={{ false: p.border, true: d.btn.mid }}
            thumbColor={d.onPrimary}
          />
          <Text variant="bodyStrong" style={{ marginLeft: 12, flex: 1 }}>
            {i18n.t("training.toggle")}
          </Text>
        </Card>

        {saveErr ? (
          <Text variant="caption" color={p.stateDanger} style={{ marginTop: 12 }}>
            {saveErr}
          </Text>
        ) : null}

        <View style={{ marginTop: 24 }}>
          <Button3D
            testID="training-continue"
            full
            label={i18n.t("training.continue")}
            onPress={cont}
            loading={busy}
          />
        </View>
      </View>
    </Screen>
  );
}
