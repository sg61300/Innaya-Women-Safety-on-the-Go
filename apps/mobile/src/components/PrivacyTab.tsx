import { useEffect, useRef, useState } from "react";
import { View, Image, Switch, Pressable, Linking } from "react-native";
import { useTheme } from "../theme";
import { Card } from "./Card";
import { Text } from "./Text";
import { supabase } from "../lib/supabase";
import { events } from "../lib/events";
import { TRAINING_PROMISES, TERMS_VERSION } from "../data/terms";
import { PROVIDERS, providerFor, type Provider } from "../data/providers";
import i18n from "../i18n";

const sampleImage = require("../../assets/privacy-sample.png");

// V12 Privacy tab (ADR-015 training consent + ADR-019 on-device masking surface).
// Reads/writes profiles.consent_c7_training; the provider list is read from
// GET /api/health when reachable, else the curated PROVIDERS fallback.
export function PrivacyTab({
  userId, onDownloadData, onDeleteAccount,
}: {
  userId: string;
  onDownloadData?: () => void;
  onDeleteAccount?: () => void;
}) {
  const { p, d } = useTheme();
  const [training, setTraining] = useState(false);
  const [providers, setProviders] = useState<Provider[]>(PROVIDERS);
  const mounted = useRef(true);
  // Set once the user touches the switch, so a late initial load cannot clobber
  // the user's choice with the previously-saved value.
  const touched = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Load the saved training-consent value.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("consent_c7_training")
          .eq("id", userId)
          .single();
        if (mounted.current && data && !touched.current) setTraining(!!(data as { consent_c7_training?: boolean }).consent_c7_training);
      } catch {
        /* keep default */
      }
    })();
  }, [userId]);

  // Best-effort refine of the provider list from the live API. Names only come
  // back, so we map each to a curated entry (unknown names dropped). Any failure
  // silently keeps the fallback list.
  useEffect(() => {
    const base = process.env.EXPO_PUBLIC_API_URL;
    if (!base) return;
    (async () => {
      try {
        const res = await fetch(`${base}/api/health`);
        const json = await res.json();
        if (!mounted.current || !Array.isArray(json?.providers)) return;
        const mapped = (json.providers as string[])
          .map(providerFor)
          .filter((x): x is Provider => !!x);
        if (mapped.length) setProviders(mapped);
      } catch {
        /* keep fallback */
      }
    })();
  }, []);

  async function toggleTraining(next: boolean) {
    touched.current = true;
    setTraining(next); // live UI
    const at = new Date().toISOString();
    // Only the DB write governs the consent record. Revert the switch ONLY when
    // it fails, so the UI never disagrees with what is stored.
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ consent_c7_training: next, consent_c7_answered_at: at })
        .eq("id", userId);
      if (error) throw error;
    } catch (e) {
      if (mounted.current) setTraining(!next); // revert on DB failure
      console.warn("[privacy] training consent save failed", (e as Error).message);
      return;
    }
    // The audit-log write is best-effort: a failure must not flip the UI back.
    try {
      await events.log("consent_c7", { version: TERMS_VERSION, on: next });
    } catch (e) {
      console.warn("[privacy] consent_c7 log failed", (e as Error).message);
    }
  }

  return (
    <View style={{ gap: 16 }} testID="privacy-tab">
      {/* (1) What the AI sees */}
      <Card>
        <Text variant="subtitle">{i18n.t("privacy.whatAiSeesTitle")}</Text>
        <Image
          source={sampleImage}
          accessibilityLabel={i18n.t("privacy.whatAiSeesTitle")}
          resizeMode="cover"
          style={{ width: "100%", height: 160, borderRadius: 14, marginTop: 12, backgroundColor: d.card.border }}
        />
        <Text variant="body" color="muted" style={{ marginTop: 12 }}>
          {i18n.t("privacy.whatAiSeesBody")}
        </Text>
      </Card>

      {/* (2) Training consent */}
      <Card>
        <Text variant="subtitle">{i18n.t("training.title")}</Text>
        {TRAINING_PROMISES.map((promise, i) => (
          <View key={promise} style={{ flexDirection: "row", marginTop: i === 0 ? 14 : 12 }}>
            <Text variant="body" color={p.stateSafe} style={{ marginRight: 10 }}>✓</Text>
            <Text variant="body" style={{ flex: 1 }}>{promise}</Text>
          </View>
        ))}
        <View style={{ flexDirection: "row", marginTop: 12 }}>
          <Text variant="body" color={p.stateSafe} style={{ marginRight: 10 }}>✓</Text>
          <Text variant="body" style={{ flex: 1 }}>{i18n.t("privacy.trainingFourth")}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
          <Text variant="bodyStrong" style={{ flex: 1, marginRight: 12 }}>{i18n.t("privacy.trainingToggle")}</Text>
          <Switch
            testID="privacy-training-switch"
            value={training}
            onValueChange={toggleTraining}
            trackColor={{ true: p.brand, false: d.card.border }}
            accessibilityLabel={i18n.t("training.title")}
          />
        </View>
        <Text variant="caption" color="muted" style={{ marginTop: 10 }}>
          {i18n.t("privacy.trainingCaption")}
        </Text>
      </Card>

      {/* (3) Who scores your frames */}
      <Card>
        <Text variant="subtitle">{i18n.t("privacy.providersTitle")}</Text>
        {providers.map((prov) => (
          <View
            key={prov.name}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}
          >
            <Text variant="body">{prov.name}</Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${prov.name} ${i18n.t("privacy.terms")}`}
              testID={`privacy-terms-${prov.name}`}
              onPress={() => Linking.openURL(prov.terms).catch(() => {})}
              hitSlop={8}
            >
              <Text variant="body" color={p.brand}>{i18n.t("privacy.terms")}</Text>
            </Pressable>
          </View>
        ))}
      </Card>

      {/* (4) Data controls (Task 34 wires the handlers) */}
      <Card>
        <Pressable
          accessibilityRole="button"
          testID="privacy-download-data"
          onPress={onDownloadData ?? (() => console.log("[privacy] download data (Task 34)"))}
          style={{ minHeight: 48, justifyContent: "center" }}
        >
          <Text variant="body">{i18n.t("privacy.downloadData")}</Text>
        </Pressable>
        <View style={{ height: 1, backgroundColor: d.card.border, marginVertical: 4 }} />
        <Pressable
          accessibilityRole="button"
          testID="privacy-delete-account"
          onPress={onDeleteAccount ?? (() => console.log("[privacy] delete account (Task 34)"))}
          style={{ minHeight: 48, justifyContent: "center" }}
        >
          <Text variant="body" color={d.sos}>{i18n.t("privacy.deleteAccount")}</Text>
        </Pressable>
      </Card>
    </View>
  );
}
