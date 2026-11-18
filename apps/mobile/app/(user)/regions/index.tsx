import { useEffect, useRef, useState } from "react";
import { View, ScrollView, Pressable, RefreshControl } from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";
import Slider from "@react-native-community/slider";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTheme } from "../../../src/theme";
import { Text } from "../../../src/components/Text";
import { Card } from "../../../src/components/Card";
import { Chip } from "../../../src/components/Chip";
import { Button3D } from "../../../src/components/Button3D";
import { Illustration } from "../../../src/components/Illustration";
import { useScrollTopOnFocus } from "../../../src/lib/useScrollTopOnFocus";
import { TourTarget, useTourScroller } from "../../../src/components/tour/TourProvider";
import { regions, regionColour, CITY_CENTRES, REASON_KEYS, TIME_KEYS, type Region, type RegionStatus } from "../../../src/services/regions";
import { supabase } from "../../../src/lib/supabase";
import { events } from "../../../src/lib/events";
import type { ChipKind } from "../../../src/theme";
import i18n from "../../../src/i18n";

const CITIES: { key: string; centre: { latitude: number; longitude: number } | null }[] = [
  ...CITY_CENTRES,
  { key: "Near me", centre: null },
];

const statusChipKind = (s: string): ChipKind => (s === "red" ? "critical" : s === "safe_by_police" ? "neutral" : "amber");

// A selectable pill (report-form chips carry state, per the amendment).
function SelectChip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID: string }) {
  const { p, d } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ minHeight: 48, justifyContent: "center", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: selected ? d.chip.brand.bg : "transparent", borderWidth: 1, borderColor: selected ? "transparent" : p.border }}
    >
      <Text variant="label" color={selected ? d.chip.brand.fg : "muted"}>{label}</Text>
    </Pressable>
  );
}

export default function RegionsScreen() {
  const { p, d } = useTheme();
  const router = useRouter();
  const { highlight, ts } = useLocalSearchParams<{ highlight?: string; ts?: string }>();
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [toast, setToast] = useState(false);
  const [origin, setOrigin] = useState({ latitude: 28.6139, longitude: 77.209 });
  const [list, setList] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [city, setCity] = useState("Near me");
  // F15 (b16): risk-level filter, applied to both the list and the map markers.
  // Persists across city switches (plain state, never reset in pickCity).
  const [risk, setRisk] = useState<RegionStatus | "all">("all");
  const mapRef = useRef<MapView>(null);
  const scrollRef = useRef<ScrollView>(null);
  useScrollTopOnFocus(scrollRef); // F17: reset to top when the Regions tab regains focus
  useTourScroller("/(user)/regions", scrollRef); // F6: scroll tour targets into view
  const reqId = useRef(0);

  const [reporting, setReporting] = useState(false);
  const [marker, setMarker] = useState(origin);
  const [radius, setRadius] = useState(150);
  const [reason, setReason] = useState<string | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reportError, setReportError] = useState(false);

  const load = async (lat: number, lng: number, radius_m = 4370) => {
    const my = ++reqId.current; // only the latest request may write state
    setLoading(true); setError(false);
    try {
      const rows = await regions.near(lat, lng, radius_m);
      if (my === reqId.current) setList(rows);
    } catch (e) {
      console.warn("[regions] load failed", e);
      if (my === reqId.current) setError(true);
    } finally {
      if (my === reqId.current) setLoading(false);
    }
  };

  useEffect(() => {
    // regions_opened: one per screen open (feeds M2 "used Regions > 3 times").
    void events.log("regions_opened", {});
    (async () => {
      try {
        const Location = require("expo-location");
        const pos = await Location.getCurrentPositionAsync({});
        const o = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setOrigin(o); setMarker(o); await load(o.latitude, o.longitude);
      } catch (e) { console.warn("[regions] location failed", e); await load(origin.latitude, origin.longitude); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // F4: a fresh report navigates here with ?highlight=<regionId>&ts=<n>. Reload
  // so a newly created area appears, flag its row/circle, and show a toast.
  useEffect(() => {
    if (!highlight) return;
    setHighlightId(String(highlight));
    setToast(true);
    void load(origin.latitude, origin.longitude);
    const t = setTimeout(() => setToast(false), 3500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, ts]);

  const pickCity = async (c: (typeof CITIES)[number]) => {
    setCity(c.key);
    if (c.centre) {
      // Pan to the picked city and load a whole-city 15 km radius; "Near me"
      // keeps the tight 4.37 km circle around the user's own location.
      mapRef.current?.animateToRegion({ ...c.centre, latitudeDelta: 0.15, longitudeDelta: 0.15 }, 400);
      await load(c.centre.latitude, c.centre.longitude, 15000);
    } else {
      await load(origin.latitude, origin.longitude, 4370);
    }
  };

  const byCity = city === "Near me" ? list : list.filter((r) => r.city === city);
  const visible = risk === "all" ? byCity : byCity.filter((r) => r.status === risk);
  const RISK_FILTERS: (RegionStatus | "all")[] = ["all", "red", "amber", "safe_by_police"];

  // F13: straight-line distance from the user origin to a region centroid (km),
  // or null when the region carries no lat/lng (migration 0014 not applied).
  const distKm = (r: Region): number | null => {
    if (r.lat == null || r.lng == null) return null;
    const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(r.lat - origin.latitude), dLng = rad(r.lng - origin.longitude);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(origin.latitude)) * Math.cos(rad(r.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  };

  const submit = async () => {
    if (!reason) return;
    setSubmitting(true); setReportError(false);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) { setReportError(true); return; } // no signed-in user → never send an empty reporter_id
      await regions.report({ lat: marker.latitude, lng: marker.longitude, radiusM: radius, reason, timeOfDay: timeOfDay ?? undefined }, uid);
      setReporting(false); setReason(null); setTimeOfDay(null);
      await load(origin.latitude, origin.longitude);
    } catch (e) { console.warn("[regions] report failed", e); setReportError(true); }
    finally { setSubmitting(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: p.bgBase }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 14 }}
        testID="regions-scroll"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(origin.latitude, origin.longitude)} />}
      >
        <Text variant="title">{i18n.t("regions.title")}</Text>

        {/* City filter chips */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {CITIES.map((c) => (
            <SelectChip key={c.key} testID={`city-${c.key}`} label={c.centre ? c.key : i18n.t("regions.nearMe")} selected={city === c.key} onPress={() => pickCity(c)} />
          ))}
        </View>

        {/* F15: risk-level filter (applies to the list and the map markers) */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {RISK_FILTERS.map((rk) => (
            <SelectChip
              key={rk}
              testID={`risk-${rk}`}
              label={rk === "all" ? i18n.t("regions.riskAll") : i18n.t(`regions.status.${rk}`)}
              selected={risk === rk}
              onPress={() => setRisk(rk)}
            />
          ))}
        </View>

        {/* Map */}
        <TourTarget id="regionsMap" style={{ borderRadius: 18, overflow: "hidden" }}>
          <View testID="regions-map" style={{ height: 260 }}>
            <MapView
              ref={mapRef}
              style={{ flex: 1 }}
              initialRegion={{ ...origin, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
            >
              <Circle center={origin} radius={4370} strokeColor={p.brand} strokeWidth={2} fillColor="rgba(0,0,0,0)" />
              {visible.map((r) => {
                const col = regionColour(r.status);
                return (
                  <Circle
                    key={r.id}
                    testID={`region-circle-${r.id}`}
                    center={r.lat != null && r.lng != null ? { latitude: r.lat, longitude: r.lng } : origin}
                    radius={r.radius_m}
                    fillColor={col.fill}
                    strokeColor={r.status === "red" ? p.stateDanger : p.stateWatch}
                    strokeWidth={2}
                    lineDashPattern={col.dashed ? [6, 4] : undefined}
                  />
                );
              })}
              {reporting ? (
                <Marker testID="report-marker" draggable coordinate={marker} onDragEnd={(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => setMarker(e.nativeEvent.coordinate)} />
              ) : null}
            </MapView>
          </View>
        </TourTarget>

        {!reporting ? (
          <Button3D full label={i18n.t("regions.reportCta")} onPress={() => { setMarker(origin); setReporting(true); }} testID="report-fab" />
        ) : (
          <Card testID="report-form">
            <Text variant="subtitle" style={{ marginBottom: 10 }}>{i18n.t("regions.reportTitle")}</Text>
            <Text variant="caption" color="muted" style={{ marginBottom: 6 }}>{i18n.t("regions.radiusLabel", { m: radius })}</Text>
            <Slider testID="radius-slider" minimumValue={50} maximumValue={500} step={10} value={radius} onValueChange={setRadius} minimumTrackTintColor={p.brand} maximumTrackTintColor={p.border} />
            <Text variant="label" color="muted" style={{ marginTop: 10, marginBottom: 6 }}>{i18n.t("regions.reasonLabel")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {REASON_KEYS.map((k) => (
                <SelectChip key={k} testID={`reason-${k}`} label={i18n.t(`regions.reason.${k}`)} selected={reason === k} onPress={() => setReason(k)} />
              ))}
            </View>
            <Text variant="label" color="muted" style={{ marginTop: 12, marginBottom: 6 }}>{i18n.t("regions.timeLabel")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {TIME_KEYS.map((k) => (
                <SelectChip key={k} testID={`time-${k}`} label={i18n.t(`regions.time.${k}`)} selected={timeOfDay === k} onPress={() => setTimeOfDay(k)} />
              ))}
            </View>
            <Text variant="caption" color="faint" style={{ marginTop: 12 }}>{i18n.t("regions.fiveRule")}</Text>
            {reportError ? <Text testID="report-error" variant="caption" color={p.stateDanger} style={{ marginTop: 10 }}>{i18n.t("regions.reportError")}</Text> : null}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Button3D variant="ghost" label={i18n.t("regions.cancel")} onPress={() => setReporting(false)} testID="report-cancel" />
              <Button3D label={i18n.t("regions.submit")} onPress={submit} disabled={!reason} loading={submitting} testID="report-submit" />
            </View>
          </Card>
        )}

        {/* F12: jump to the user's own submitted reports. Shown whenever the tab
            has loaded content. */}
        {!loading && !error && list.length > 0 ? (
          <Button3D variant="ghost" full label={i18n.t("regions.myReportsCta")} onPress={() => router.navigate("/(user)/regions/my-reports")} testID="regions-my-reports" />
        ) : null}

        {/* Region list */}
        <TourTarget id="regionCards" style={{ gap: 10 }}>
          {loading ? (
            <Text testID="regions-loading" variant="caption" color="muted">{i18n.t("regions.loading")}</Text>
          ) : error ? (
            <Text testID="regions-error" variant="caption" color="muted">{i18n.t("regions.error")}</Text>
          ) : visible.length === 0 ? (
            <View style={{ alignItems: "center", gap: 10, paddingVertical: 12 }}>
              <Illustration name="regions-empty" size={96} testID="regions-empty-art" />
              <Text testID="regions-empty" variant="caption" color="muted">{i18n.t("regions.empty")}</Text>
            </View>
          ) : (
            visible.map((r) => {
              const dk = distKm(r);
              return (
              <Card variant="raised" key={r.id} testID={`region-row-${r.id}`} onPress={() => router.navigate(`/(user)/regions/${r.id}`)}
                style={r.id === highlightId ? { borderWidth: 2, borderColor: p.brand } : undefined}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: regionColour(r.status).fill, alignItems: "center", justifyContent: "center" }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: r.status === "red" ? p.stateDanger : p.stateWatch }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{r.name ?? i18n.t("regions.unnamed")}</Text>
                    <Text variant="caption" color="muted">
                      {i18n.t("regions.reportsCount", { count: r.report_count })}
                      {dk != null ? ` · ${i18n.t("regions.distanceAway", { km: dk.toFixed(1) })}` : ""}
                    </Text>
                  </View>
                  <Chip kind={statusChipKind(r.status)} label={i18n.t(`regions.status.${r.status}`)} />
                </View>
              </Card>
              );
            })
          )}
        </TourTarget>
      </ScrollView>
      {toast ? (
        <View testID="report-toast" style={{ position: "absolute", left: 16, right: 16, bottom: 90, backgroundColor: p.brand, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16 }}>
          <Text variant="label" style={{ color: d.onPrimary, textAlign: "center" }}>{i18n.t("regions.reportAddedToast")}</Text>
        </View>
      ) : null}
    </View>
  );
}
