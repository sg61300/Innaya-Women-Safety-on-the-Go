import { useEffect, useRef, useState } from "react";
import { View, Pressable, Animated, Modal } from "react-native";
import MapView, { Polyline, Marker } from "react-native-maps";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useKeepAwake } from "expo-keep-awake";
import { Screen } from "../../../src/components/Screen";
import { Text } from "../../../src/components/Text";
import { Card } from "../../../src/components/Card";
import { Chip } from "../../../src/components/Chip";
import { Button3D } from "../../../src/components/Button3D";
import { SensorPill } from "../../../src/components/SensorPill";
import { useTheme } from "../../../src/theme";
import { useJourney } from "../../../src/store/journey";
import { runner } from "../../../src/services/protocolRunner";
import { supabase } from "../../../src/lib/supabase";
import { events } from "../../../src/lib/events";
import i18n from "../../../src/i18n";

// Task 27 — the active-journey screen. Full-bleed map with the planned route, a
// live header, the monitoring/heightened chips, the sensor row (camera pause via
// hold), the transport card, and the three journey actions. It owns no protocol
// logic beyond calling runner.send / the guardian-link endpoint; the modal and
// runner own challenges and escalation.
const CAM_HOLD_MS = 1000;

// journeys_v.mode slug → existing journeyNew.mode* label key.
const MODE_KEY: Record<string, string> = {
  "public-transport": "journeyNew.modePublic",
  cab: "journeyNew.modeCab",
  auto: "journeyNew.modeAuto",
  pool: "journeyNew.modePool",
  colleague: "journeyNew.modeColleague",
  walking: "journeyNew.modeWalking",
};

const fmtDur = (secs: number) => {
  const m = Math.max(0, Math.round(secs / 60));
  return i18n.t("active.minutes", { n: m });
};

export default function JourneyActiveScreen() {
  useKeepAwake();
  const { p } = useTheme();
  const router = useRouter();
  const journey = useJourney((s) => s.journey);
  const ctx = useJourney((s) => s.ctx);
  const sensors = useJourney((s) => s.sensors);
  const lite = useJourney((s) => s.lite);
  const battery = useJourney((s) => s.battery);

  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [guardians, setGuardians] = useState<{ id: string; name: string }[]>([]);
  const [sheet, setSheet] = useState<null | "guardians" | "sensor">(null);
  const [sensorFix, setSensorFix] = useState<string>("");
  const [linkNote, setLinkNote] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cadenceInfoVisible, setCadenceInfoVisible] = useState(true);

  const jid = journey?.id as string | undefined;
  const dangerZone = !!journey?.danger_zone;

  // Elapsed clock.
  useEffect(() => {
    if (!journey?.start_at) return;
    const start = new Date(String(journey.start_at)).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [journey?.start_at]);

  // Active guardians for the monitoring chip + sheet.
  useEffect(() => {
    if (!jid) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("monitoring_assignments")
          .select("contact_id, contacts(name)")
          .eq("journey_id", jid)
          .eq("active", true);
        if (!alive) return;
        setGuardians(
          (data ?? []).map((r: any) => ({ id: String(r.contact_id), name: r.contacts?.name ?? i18n.t("active.aGuardian") }))
        );
      } catch (e) {
        console.warn("[active] guardians load failed", (e as Error)?.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [jid]);

  // Best-effort live position for the map marker; also feeds the runner tick.
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Location = require("expo-location");
        const perm = await Location.getForegroundPermissionsAsync?.();
        if (!perm?.granted) return;
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy?.Balanced ?? 3, distanceInterval: 15 },
          (loc: any) => {
            const next = { lat: loc.coords.latitude, lng: loc.coords.longitude };
            setPos(next);
            runner.tick(next);
          }
        );
      } catch (e) {
        console.warn("[active] location watch failed", (e as Error)?.message);
      }
    })();
    return () => sub?.remove();
  }, []);

  const from = { latitude: Number(journey?.from_lat ?? 0), longitude: Number(journey?.from_lng ?? 0) };
  const to = { latitude: Number(journey?.to_lat ?? 0), longitude: Number(journey?.to_lng ?? 0) };
  const hasRoute = Number.isFinite(from.latitude) && Number.isFinite(to.latitude) && (to.latitude !== 0 || to.longitude !== 0);

  const arrived = () => runner.send({ type: "END" });
  const changePlan = async () => {
    await runner.send({ type: "PLAN_CHANGE" });
    router.navigate("/(user)/journey/new?edit=1");
  };
  const shareLink = async () => {
    try {
      // GET (owner-only) — the shared api `post` helper is POST-only, so this
      // small GET is inline, mirroring its auth header.
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/guardian-link?journeyId=${jid ?? ""}`, {
        headers: { authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      if (!res.ok) throw new Error(`guardian-link ${res.status}`);
      const { url } = (await res.json()) as { url: string };
      await Clipboard.setStringAsync(url);
      setLinkNote(true);
      setTimeout(() => setLinkNote(false), 2500);
      void events.log("share_link_copied", {}, jid ?? null);
    } catch (e) {
      console.warn("[active] share link failed", (e as Error)?.message);
    }
  };

  const holdPauseCam = () => runner.send({ type: "SENSOR_PAUSE_REQUEST", sensor: "cam" });
  const tapCam = () => {
    if (ctx.cameraPaused) runner.send({ type: "SENSOR_RESUME", sensor: "cam" });
  };
  const toggleCamera = () => {
    if (ctx.cameraPaused) void runner.send({ type: "SENSOR_RESUME", sensor: "cam" });
    else void runner.send({ type: "SENSOR_PAUSE_REQUEST", sensor: "cam" });
  };
  const openSensorFix = (sensor: string) => {
    setSensorFix(i18n.t(`active.sensorFix.${sensor}`));
    setSheet("sensor");
  };

  return (
    <Screen topInset={false} testID="active-screen">
      <View style={{ flex: 1 }}>
        <MapView testID="active-map" style={{ flex: 1 }} region={pos ? { latitude: pos.lat, longitude: pos.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 } : undefined}>
          {hasRoute ? <Polyline testID="active-route" coordinates={[from, to]} strokeColor={p.brand} strokeWidth={4} /> : null}
          {hasRoute ? <Marker testID="active-to" coordinate={to} /> : null}
          {pos ? <Marker testID="active-here" coordinate={{ latitude: pos.lat, longitude: pos.lng }} /> : null}
        </MapView>

        {/* Background tint: static danger in a danger zone, else a calm pulse. */}
        <PulseTint state={ctx.state} dangerZone={dangerZone} />

        {/* Recording indicator. */}
        <View testID="active-recording" style={{ position: "absolute", top: 14, right: 14, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: p.bgCard, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.sos }} />
          <Text variant="label" color={p.textMuted}>{i18n.t("active.watching")}</Text>
        </View>

        <View style={{ position: "absolute", top: 58, left: 12, right: 12 }}>
          <Button3D
            testID="active-camera-toggle"
            full
            variant="ghost"
            label={i18n.t(ctx.cameraPaused ? "active.cameraResume" : "active.cameraPause")}
            onPress={toggleCamera}
          />
        </View>

        {/* F9 (founder live test): visible "Listening" indicator, bound to the REAL
            keyword-listener state (sensors.mic, set by audio.start/stop). Paired with
            the "[audio] listening on/off" logcat line. */}
        {sensors.mic ? (
          <View testID="active-listening" style={{ position: "absolute", top: 48, right: 14, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: p.bgCard, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.brand }} />
            <Text variant="label" color={p.textMuted}>{i18n.t("active.listening")}</Text>
          </View>
        ) : null}

        {/* Header card. */}
        <View style={{ position: "absolute", top: 12, left: 12, right: 120, gap: 8 }}>
          <Card testID="active-header" style={{ gap: 4 }}>
            <Text variant="bodyStrong" color="primary" numberOfLines={1}>
              {i18n.t("active.fromTo", { from: journey?.from_label ?? "—", to: journey?.to_label ?? "—" })}
            </Text>
            <Text variant="caption" color="muted">
              {i18n.t("active.elapsedEta", { elapsed: fmtDur(elapsed), eta: fmtDur(Number(journey?.eta_seconds ?? 0)) })}
            </Text>
          </Card>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Pressable testID="active-monitoring-chip" onPress={() => setSheet("guardians")}>
              <Chip kind="brand" label={i18n.t("active.watchingN", { n: guardians.length })} dot />
            </Pressable>
            {ctx.heightened ? <Chip kind="amber" label={i18n.t("active.watchingClosely")} dot testID="active-heightened-chip" /> : null}
          </View>
        </View>

        {/* Bottom controls. */}
        <View style={{ position: "absolute", left: 12, right: 12, bottom: 16, gap: 10 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Pressable testID="active-camera-pill" onLongPress={holdPauseCam} delayLongPress={CAM_HOLD_MS} onPress={tapCam}>
              <SensorPill sensor="camera" on={!!sensors.cam && !ctx.cameraPaused} paused={!!ctx.cameraPaused} lite={lite ? battery : null} />
            </Pressable>
            <SensorPill sensor="voice" on={!!sensors.mic} onPress={() => openSensorFix("voice")} />
            <SensorPill sensor="gps" on={!!sensors.gps} onPress={() => openSensorFix("gps")} />
          </View>

          <Card testID="active-transport" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="bodyStrong" color="primary">{i18n.t(MODE_KEY[String(journey?.mode ?? "")] ?? "active.transport")}</Text>
            {linkNote ? <Text variant="caption" color="muted" testID="active-link-copied">{i18n.t("active.linkCopied")}</Text> : null}
          </Card>

          <Button3D testID="active-arrived" full label={i18n.t("active.arrived")} onPress={arrived} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button3D testID="active-changeplan" full variant="ghost" label={i18n.t("active.changePlan")} onPress={changePlan} />
            </View>
            <View style={{ flex: 1 }}>
              <Button3D testID="active-sharelink" full variant="ghost" label={i18n.t("active.shareLink")} onPress={shareLink} />
            </View>
          </View>
        </View>
      </View>

      <Modal visible={cadenceInfoVisible} transparent animationType="fade" onRequestClose={() => setCadenceInfoVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Card testID="active-cadence-info" style={{ width: "100%", gap: 10 }}>
            <Text variant="title" color="primary">{i18n.t("active.cameraCadenceTitle")}</Text>
            <Text variant="body" color="muted">{i18n.t("active.cameraCadenceBody")}</Text>
            <Button3D testID="active-cadence-dismiss" full label={i18n.t("active.cameraCadenceDismiss")} onPress={() => setCadenceInfoVisible(false)} />
          </Card>
        </View>
      </Modal>

      {/* Guardians / sensor-fix sheet. */}
      <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }} onPress={() => setSheet(null)}>
          <View testID="active-sheet" style={{ backgroundColor: p.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10 }}>
            {sheet === "guardians" ? (
              <>
                <Text variant="title" color="primary">{i18n.t("active.watchingN", { n: guardians.length })}</Text>
                {guardians.length === 0 ? (
                  <Text variant="body" color="muted">{i18n.t("active.noGuardians")}</Text>
                ) : (
                  guardians.map((g) => (
                    <Text key={g.id} variant="body" color="primary" testID={`active-guardian-${g.id}`}>
                      {g.name}
                    </Text>
                  ))
                )}
              </>
            ) : (
              <Text variant="body" color="primary" testID="active-sensorfix">{sensorFix}</Text>
            )}
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

// Calm safe pulse (state === SAFE) / static danger tint. Native-driver opacity so
// there is no JS animation loop to leak in tests.
function PulseTint({ state, dangerZone }: { state: string; dangerZone: boolean }) {
  const { p } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (dangerZone || state !== "SAFE") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [state, dangerZone]);

  if (dangerZone) {
    return <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: p.stateDanger, opacity: 0.18 }} testID="active-tint-danger" />;
  }
  const opacity = state === "SAFE" ? anim.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.12] }) : 0.08;
  return <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: state === "SAFE" ? p.stateSafe : p.stateWatch, opacity }} testID="active-tint" />;
}
