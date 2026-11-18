import { useState } from "react";
import { View, Pressable, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Button3D } from "../../src/components/Button3D";
import { TextLink } from "../../src/components/TextLink";
import { supabase } from "../../src/lib/supabase";
import { useSession } from "../../src/store/session";
import { events } from "../../src/lib/events";
import {
  TESTER_TERMS_VERSION,
  TESTER_TERMS_URL,
  TESTER_TERMS_ACCEPTED_AT_KEY,
  TESTER_TERMS_VERSION_KEY,
} from "../../src/lib/testerTerms";
import { useTheme } from "../../src/theme";
import i18n from "../../src/i18n";

// Tester-terms gate (founder ruling 2026-09-24). A SEPARATE, earlier screen than
// the C1 legal consent (ADR-015) and the C7 training consent — this one is shown
// before sign-up and on first launch of a session that has not accepted. One
// required checkbox; Continue is disabled until it is ticked. Acceptance is
// stored on the device (the gate) and, when a session already exists, mirrored to
// the profile. The server write is best-effort: an offline tester still passes
// the gate locally and app/index.tsx writes the column on the next launch.
export default function TesterTerms() {
  const { p, d } = useTheme();
  const insets = useSafeAreaInsets();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const { userId, profile, set } = useSession();

  const BULLETS = [
    i18n.t("testerTerms.b1"),
    i18n.t("testerTerms.b2"),
    i18n.t("testerTerms.b3"),
    i18n.t("testerTerms.b4"),
    i18n.t("testerTerms.b5"),
  ];

  async function accept() {
    if (!checked || busy) return;
    setBusy(true);
    setSaveErr(null);
    const at = new Date().toISOString();
    // The device flag is the gate, so it must persist before we route away; a
    // storage failure blocks (routing back to "/" would re-gate and loop).
    try {
      await AsyncStorage.multiSet([
        [TESTER_TERMS_ACCEPTED_AT_KEY, at],
        [TESTER_TERMS_VERSION_KEY, TESTER_TERMS_VERSION],
      ]);
    } catch (e) {
      setSaveErr(i18n.t("testerTerms.saveError"));
      console.warn("[tester-terms] local save failed", (e as Error).message);
      setBusy(false);
      return;
    }
    // Best-effort server mirror. Skipped before sign-up (no session); if it fails
    // (e.g. offline) the local flag still holds and index.tsx retries next launch.
    if (userId) {
      try {
        const { error } = await supabase
          .from("profiles")
          .update({ tester_terms_accepted_at: at, tester_terms_version: TESTER_TERMS_VERSION })
          .eq("id", userId);
        if (error) throw error;
        set({
          profile: {
            ...(profile ?? {}),
            tester_terms_accepted_at: at,
            tester_terms_version: TESTER_TERMS_VERSION,
          },
        });
      } catch (e) {
        console.warn("[tester-terms] server write deferred", (e as Error).message);
      }
    }
    void events.log("tester_terms", { version: TESTER_TERMS_VERSION });
    router.replace("/");
  }

  return (
    <Screen
      scroll
      padded
      testID="tester-terms-screen"
      header={
        // X3 (s25): the heading stays fixed while the terms bullets scroll.
        <View style={{ paddingTop: 24, paddingBottom: 8 }}>
          <Text variant="titleSerif">{i18n.t("testerTerms.heading")}</Text>
        </View>
      }
    >
      <View style={{ paddingBottom: insets.bottom }}>
        <Text variant="body" color="muted" style={{ marginTop: 12 }}>
          {i18n.t("testerTerms.intro")}
        </Text>

        {BULLETS.map((b) => (
          <View key={b} style={{ flexDirection: "row", marginTop: 10 }}>
            <Text variant="body" color="muted" style={{ marginRight: 8 }}>
              •
            </Text>
            <Text variant="body" color="muted" style={{ flex: 1 }}>
              {b}
            </Text>
          </View>
        ))}

        <View style={{ alignItems: "flex-start", marginTop: 20, marginBottom: 8 }}>
          <TextLink
            testID="tester-terms-full"
            label={i18n.t("testerTerms.readFull")}
            onPress={() => Linking.openURL(TESTER_TERMS_URL).catch(() => {})}
          />
        </View>

        <Pressable
          testID="tester-terms-check"
          accessibilityRole="checkbox"
          accessibilityLabel={i18n.t("testerTerms.readAccept")}
          accessibilityState={{ checked }}
          onPress={() => setChecked((v) => !v)}
          hitSlop={8}
          style={{ flexDirection: "row", alignItems: "center", minHeight: 48 }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: p.brand,
              backgroundColor: checked ? d.btn.mid : "transparent",
              marginRight: 10,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {checked ? (
              <Text variant="caption" color={d.btn.label}>
                ✓
              </Text>
            ) : null}
          </View>
          <Text variant="body" style={{ flex: 1 }}>
            {i18n.t("testerTerms.readAccept")}
          </Text>
        </Pressable>

        {saveErr ? (
          <Text variant="caption" color={p.stateDanger} style={{ marginTop: 8 }}>
            {saveErr}
          </Text>
        ) : null}

        <Button3D
          testID="tester-terms-continue"
          full
          label={i18n.t("testerTerms.continue")}
          onPress={accept}
          disabled={!checked}
          loading={busy}
        />
      </View>
    </Screen>
  );
}
