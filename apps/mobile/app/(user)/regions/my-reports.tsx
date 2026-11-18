import { useEffect, useState } from "react";
import { View, ScrollView } from "react-native";
import { Screen } from "../../../src/components/Screen";
import { Text } from "../../../src/components/Text";
import { Card } from "../../../src/components/Card";
import { Chip } from "../../../src/components/Chip";
import { Illustration } from "../../../src/components/Illustration";
import { regions, type MyReport } from "../../../src/services/regions";
import { supabase } from "../../../src/lib/supabase";
import i18n from "../../../src/i18n";

const statusChipKind = (s: string): "critical" | "neutral" | "amber" => (s === "red" ? "critical" : s === "safe_by_police" ? "neutral" : "amber");

// F12 (b16): every report the signed-in user has submitted, newest first. The
// back control mirrors the region detail (BackHeader + nested Stack), so
// hardware Back returns to the Regions list.
export default function MyReportsScreen() {
  const [rows, setRows] = useState<MyReport[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u?.user?.id;
        if (!uid) { setRows([]); return; }
        setRows(await regions.myReports(uid));
      } catch (e) {
        console.warn("[my-reports] load failed", (e as Error)?.message);
        setError(true);
      }
    })();
  }, []);

  const areaName = (r: MyReport) =>
    r.region?.name
      ?? (r.region?.lat != null && r.region?.lng != null
        ? `${r.region.lat.toFixed(3)}, ${r.region.lng.toFixed(3)}`
        : i18n.t("regions.unnamed"));

  return (
    <Screen scroll padded topInset={false} testID="my-reports-screen">
      {/* Phase 3: plain title; the sole back control is the top-bar one. */}
      <Text variant="title" accessibilityRole="header">{i18n.t("regions.myReportsTitle")}</Text>
      {error ? (
        <Text testID="my-reports-error" variant="body" color="muted">{i18n.t("regions.error")}</Text>
      ) : rows == null ? (
        <Text testID="my-reports-loading" variant="body" color="muted">{i18n.t("regions.loading")}</Text>
      ) : rows.length === 0 ? (
        <View testID="my-reports-empty" style={{ alignItems: "center", gap: 10, paddingVertical: 24 }}>
          <Illustration name="regions-empty" size={96} />
          <Text variant="body" color="muted" style={{ textAlign: "center" }}>{i18n.t("regions.myReportsEmpty")}</Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {rows.map((r, i) => (
            <Card variant="raised" key={i} testID={`my-report-${i}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text variant="bodyStrong" style={{ flex: 1 }}>{areaName(r)}</Text>
                {r.region ? <Chip kind={statusChipKind(r.region.status)} label={i18n.t(`regions.status.${r.region.status}`)} /> : null}
              </View>
              <Text variant="caption" color="muted" style={{ marginTop: 4 }}>
                {i18n.t(`regions.reason.${r.reason}`, { defaultValue: r.reason })}
                {r.time_of_day ? ` · ${i18n.t(`regions.time.${r.time_of_day}`, { defaultValue: r.time_of_day })}` : ""}
              </Text>
              {r.ts ? <Text variant="caption" color="faint" style={{ marginTop: 2 }}>{new Date(r.ts).toLocaleString()}</Text> : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
