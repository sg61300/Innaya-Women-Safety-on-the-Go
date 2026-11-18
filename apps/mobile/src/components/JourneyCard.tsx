import { View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import type { ProtocolState } from "@vaira/core";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { Button3D } from "./Button3D";
import { StatusChip } from "./StatusChip";
import { SensorPill } from "./SensorPill";
import { guardiansLabel } from "./GuardianRing";
import { Illustration } from "./Illustration";
import i18n from "../i18n";

export type JourneyLatLng = { latitude: number; longitude: number };
export type Journey = {
  from?: string;
  to?: string;
  mode?: string;
  eta?: string;
  remaining?: string;
  startAt?: number;
  guardians?: number;
  fromCoord?: JourneyLatLng;
  toCoord?: JourneyLatLng;
  hasVehicle?: boolean;
};

export type JourneyCardState = ProtocolState | "idle" | "countdown";

// Monitoring states render the active card; anything else with a journey shows
// the same layout with a countdown chip; no journey → idle.
const ACTIVE_STATES = new Set<string>([
  "ARMED", "SAFE", "AMBER", "EMERGENCY", "CRITICAL",
  "CANCEL_HOLD", "RESOLVED_MONITORING", "LATE_CHECK", "RESOLVED",
]);

export function JourneyCard({
  journey, state, lite, onPlan, onChange, onEnd, onArrived, onShare,
}: {
  journey: Journey | null;
  state: JourneyCardState;
  lite?: number | null; // ADR-042/R47d: battery % when the phone is in lite mode
  onPlan: () => void;
  onChange: () => void;
  onEnd: () => void;
  onArrived?: () => void;
  onShare?: () => void;
}) {
  const { p } = useTheme();
  const active = !!journey && (state === "countdown" || ACTIVE_STATES.has(state));

  if (!active) {
    return (
      <Card variant="hero" testID="journey-card">
        {/* Map-art placeholder — real route thumbnail appears once a journey is planned. */}
        <View
          testID="journey-art"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ height: 132, borderRadius: 16, backgroundColor: p.brandSoft, alignItems: "center", justifyContent: "center", marginBottom: 14, overflow: "hidden" }}
        >
          <Illustration name="journey-plan" size={120} />
        </View>
        <Text variant="subtitle" style={{ marginBottom: 12 }}>{i18n.t("home.journeyIdlePrompt")}</Text>
        <Button3D label={i18n.t("home.planJourney")} onPress={onPlan} testID="plan-journey" full />
        <Text variant="caption" color="muted" style={{ marginTop: 10 }}>{i18n.t("home.orTapSos")}</Text>
      </Card>
    );
  }

  const j = journey!;
  const route = [j.from, j.to].filter(Boolean).join("  →  ");
  const meta = [j.mode, j.eta, j.remaining].filter(Boolean).join("  ·  ");
  const showMap = !!j.toCoord;

  return (
    <Card testID="journey-card">
      {showMap ? (
        <View testID="journey-map" style={{ height: 128, borderRadius: 16, overflow: "hidden", marginBottom: 12 }}>
          <MapView
            liteMode
            style={{ flex: 1 }}
            pointerEvents="none"
            initialRegion={{ latitude: j.toCoord!.latitude, longitude: j.toCoord!.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
          >
            {j.fromCoord ? <Marker coordinate={j.fromCoord} /> : null}
            <Marker coordinate={j.toCoord!} />
            {j.fromCoord ? <Polyline coordinates={[j.fromCoord, j.toCoord!]} strokeColor={p.brand} strokeWidth={3} /> : null}
          </MapView>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <StatusChip state={state} startAt={j.startAt} />
        <Chip testID="journey-guardians" kind="brand" label={guardiansLabel(j.guardians ?? 0)} dot />
      </View>

      {route ? <Text variant="bodyStrong" style={{ marginBottom: 4 }}>{route}</Text> : null}
      {meta ? <Text variant="caption" color="muted" style={{ marginBottom: 12 }}>{meta}</Text> : null}

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <SensorPill sensor="gps" on testID="journey-sensor-gps" />
        <SensorPill sensor="voice" on={!!j.hasVehicle} testID="journey-sensor-voice" />
        <SensorPill sensor="camera" on={false} degraded={lite == null} lite={lite ?? null} testID="journey-sensor-camera" />
      </View>

      <View style={{ gap: 8 }}>
        <Button3D variant="ghost" full label={i18n.t("home.arrived")} onPress={onArrived ?? (() => {})} testID="journey-arrived" />
        <Button3D variant="ghost" full label={i18n.t("home.changeRoute")} onPress={onChange} testID="journey-change" />
        <Button3D variant="ghost" full label={i18n.t("home.shareLink")} onPress={onShare ?? (() => {})} testID="journey-share" />
        <Button3D variant="danger" full label={i18n.t("home.endJourney")} onPress={onEnd} testID="journey-end" />
      </View>
    </Card>
  );
}
