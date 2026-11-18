import { useEffect, useState } from "react";
import { View, ScrollView, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "../../../src/theme";
import { Text } from "../../../src/components/Text";
import { Card } from "../../../src/components/Card";
import { Chip } from "../../../src/components/Chip";
import { Button3D } from "../../../src/components/Button3D";
import { regions, regionColour, type Region, type Report } from "../../../src/services/regions";
import i18n from "../../../src/i18n";

type Detail = { region: Region | null; reports: Report[]; histogram: Record<string, number> };

export default function RegionDetailScreen() {
  const { p } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try { setData(await regions.detail(String(id))); }
      catch (e) { console.warn("[region detail] load failed", e); setError(true); }
    })();
  }, [id]);

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bgBase, padding: 16 }}>
        <Text testID="detail-error" variant="body" color="muted">{i18n.t("regions.error")}</Text>
      </View>
    );
  }
  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bgBase, padding: 16 }}>
        <Text testID="detail-loading" variant="body" color="muted">{i18n.t("regions.loading")}</Text>
      </View>
    );
  }

  const { region, reports, histogram } = data;
  const max = Math.max(1, ...Object.values(histogram));
  const centroidText = region ? region.name ?? i18n.t("regions.unnamed") : "";

  const navigateAround = () => {
    // Brief mandates daddr=<lat>,<lng>. lat/lng are generated from the centroid
    // (0014_regions_latlng.sql) and arrive via select('*'); fall back to the
    // name only when coords are genuinely absent (migration not yet applied).
    const daddr =
      region && region.lat != null && region.lng != null
        ? `${region.lat},${region.lng}`
        : encodeURIComponent(centroidText);
    Linking.openURL(`https://maps.google.com/?daddr=${daddr}`).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: p.bgBase }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} testID="detail-scroll">
        {/* F13: static risk-coloured header (no map — M2 owns the map provider). */}
        {region ? (
          <View testID="detail-header" style={{ borderRadius: 16, padding: 16, gap: 8, backgroundColor: regionColour(region.status).fill }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text variant="title" style={{ flex: 1 }}>{centroidText}</Text>
              <Chip kind={region.status === "red" ? "critical" : region.status === "safe_by_police" ? "neutral" : "amber"} label={i18n.t(`regions.status.${region.status}`)} />
            </View>
          </View>
        ) : (
          <Text variant="title">{centroidText}</Text>
        )}

        {/* F13: plain-language risk explanation. */}
        {region ? (
          <Card variant="raised" testID="detail-risk">
            <Text variant="label" color="muted" style={{ marginBottom: 6 }}>{i18n.t("regions.riskTitle")}</Text>
            <Text variant="body" color="muted">{i18n.t(`regions.risk.${region.status}`, { defaultValue: i18n.t("regions.risk.amber") })}</Text>
          </Card>
        ) : null}

        <Card variant="raised" testID="detail-summary">
          <Text variant="bodyStrong">{i18n.t("regions.reportsCount", { count: reports.length })}</Text>
          <Text variant="caption" color="muted" style={{ marginTop: 4 }}>{i18n.t("regions.reportersCount", { count: region?.report_count ?? 0 })}</Text>
          <Text variant="caption" color="muted" style={{ marginTop: 4 }}>{i18n.t("regions.policeStatus", { status: region?.police_status ?? "unconfirmed" })}</Text>
        </Card>

        {/* Histogram bars by reason */}
        {Object.keys(histogram).length ? (
          <Card testID="detail-histogram">
            <Text variant="label" color="muted" style={{ marginBottom: 10 }}>{i18n.t("regions.byReason")}</Text>
            <View style={{ gap: 8 }}>
              {Object.entries(histogram).map(([k, n]) => (
                <View key={k} style={{ gap: 4 }}>
                  <Text variant="caption" color="muted">{i18n.t(`regions.reason.${k}`, { defaultValue: k })} · {n}</Text>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: p.border, overflow: "hidden" }}>
                    <View style={{ width: `${(n / max) * 100}%`, height: 8, backgroundColor: regionColour(region?.status === "red" ? "red" : "amber").fill }} />
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {/* Anonymised reports */}
        <View style={{ gap: 8 }}>
          {reports.length === 0 ? (
            <Text testID="detail-empty" variant="caption" color="muted">{i18n.t("regions.noReports")}</Text>
          ) : (
            reports.map((r, i) => (
              <Card key={i} testID={`detail-report-${i}`}>
                <Text variant="bodyStrong">{i18n.t(`regions.reason.${r.reason}`, { defaultValue: r.reason })}</Text>
                {r.details ? <Text variant="caption" color="muted" style={{ marginTop: 4 }}>{r.details}</Text> : null}
                {r.time_of_day ? <Text variant="caption" color="faint" style={{ marginTop: 4 }}>{i18n.t(`regions.time.${r.time_of_day}`, { defaultValue: r.time_of_day })}</Text> : null}
              </Card>
            ))
          )}
        </View>

        {/* F13: safety tips. */}
        <Card variant="raised" testID="detail-tips">
          <Text variant="label" color="muted" style={{ marginBottom: 8 }}>{i18n.t("regions.safetyTipsTitle")}</Text>
          {[1, 2, 3, 4].map((n) => (
            <View key={n} style={{ flexDirection: "row", marginBottom: 6 }}>
              <Text variant="body" color="muted" style={{ marginRight: 8 }}>•</Text>
              <Text variant="body" color="muted" style={{ flex: 1 }}>{i18n.t(`regions.safetyTip${n}`)}</Text>
            </View>
          ))}
        </Card>

        <View style={{ gap: 8 }}>
          {/* F14: add-report opens its own route (was: back to the list). */}
          <Button3D full label={i18n.t("regions.addReport")} testID="detail-add-report"
            onPress={() => router.navigate({ pathname: "/(user)/regions/report", params: region ? { id: region.id, lat: String(region.lat ?? ""), lng: String(region.lng ?? ""), radius: String(region.radius_m ?? 150) } : {} })} />
          <Button3D variant="ghost" full label={i18n.t("regions.navigateAround")} onPress={navigateAround} testID="detail-navigate" />
        </View>
      </ScrollView>
    </View>
  );
}
