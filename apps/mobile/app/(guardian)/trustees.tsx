import { useCallback, useEffect, useState } from "react";
import { View, Linking, RefreshControl, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Phone, MessageCircle, X } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Card } from "../../src/components/Card";
import { Button3D } from "../../src/components/Button3D";
import { IconButton } from "../../src/components/IconButton";
import { StatusChip } from "../../src/components/StatusChip";
import { useTheme } from "../../src/theme";
import { guardian, type Trustee } from "../../src/services/guardian";
import { supabase } from "../../src/lib/supabase";
import { links } from "../../src/lib/links";
import i18n from "../../src/i18n";

const EXPLAINER_KEY = "vaira.guardian.explainerSeen";

export default function TrusteesScreen() {
  const { p } = useTheme();
  const router = useRouter();
  const [rows, setRows] = useState<Trustee[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id;
    if (!uid) return;
    try {
      setRows(await guardian.trustees(uid));
    } catch {
      /* offline / RLS — leave the last list in place */
    }
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(EXPLAINER_KEY).then((v) => setShowExplainer(!v));
    load();
  }, [load]);

  const dismissExplainer = () => {
    setShowExplainer(false);
    AsyncStorage.setItem(EXPLAINER_KEY, "1").catch(() => {});
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <Screen padded topInset={false} testID="trustees-screen">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120, gap: 14, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={p.brand} />}
      >
        <Text variant="title" color="primary">
          {i18n.t("guardian.trustees.title")}
        </Text>

        {showExplainer ? (
          <Card testID="trustees-explainer" style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <Text variant="bodyStrong" color="primary" style={{ flex: 1 }}>
                {i18n.t("guardian.trustees.explainerTitle")}
              </Text>
              <IconButton icon={X} label={i18n.t("regions.cancel")} onPress={dismissExplainer} testID="trustees-explainer-close" />
            </View>
            <Text variant="caption" color="muted">
              {i18n.t("guardian.trustees.explainerBody")}
            </Text>
          </Card>
        ) : null}

        {rows.length === 0 ? (
          <Text variant="body" color="muted" testID="trustees-empty">
            {i18n.t("guardian.trustees.empty")}
          </Text>
        ) : (
          rows.map((t) => (
            <Card
              key={t.contactId}
              testID={`trustee-${t.contactId}`}
              onPress={t.journey ? () => router.navigate({ pathname: "/(guardian)/monitor/[journeyId]", params: { journeyId: t.journey!.id, name: t.name } }) : undefined}
              style={{ gap: 10 }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text variant="bodyStrong" color="primary">
                  {t.name}
                </Text>
                <StatusChip state={(t.journey?.state ?? "idle") as any} />
              </View>
              {t.journey ? (
                <Text variant="caption" color="muted">
                  {t.journey.from} → {t.journey.to}
                </Text>
              ) : (
                <Text variant="caption" color="faint">
                  {i18n.t("guardian.trustees.notTravelling")}
                </Text>
              )}
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
