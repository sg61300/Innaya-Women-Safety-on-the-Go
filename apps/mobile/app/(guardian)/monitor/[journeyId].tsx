import { useEffect, useRef, useState } from "react";
import { View, Linking, Image } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Phone, MessageCircle, Eye, Siren } from "lucide-react-native";
import { Screen } from "../../../src/components/Screen";
import { Text } from "../../../src/components/Text";
import { Card } from "../../../src/components/Card";
import { Chip } from "../../../src/components/Chip";
import { Button3D } from "../../../src/components/Button3D";
import { StatusChip } from "../../../src/components/StatusChip";
import { useTheme } from "../../../src/theme";
import { guardian } from "../../../src/services/guardian";
import { supabase } from "../../../src/lib/supabase";
import { links } from "../../../src/lib/links";
import i18n from "../../../src/i18n";

const END_CHECK_MS = 15_000;
const HEARTBEAT_MS = 30_000;

// danger_score (0-3) → guardian-facing gauge label + chip kind.
const SCORE = [
  { key: "guardian.monitor.score.calm", kind: "safe" as const },
  { key: "guardian.monitor.score.watch", kind: "amber" as const },
  { key: "guardian.monitor.score.concern", kind: "danger" as const },
  { key: "guardian.monitor.score.danger", kind: "critical" as const },
];

type Loc = { latitude: number; longitude: number };

export default function MonitorScreen() {
  const { p, d } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ journeyId: string; name?: string; phone?: string }>();
  const journeyId = String(params.journeyId ?? "");
  const name = params.name ?? "her";

  const [state, setState] = useState<string>("SAFE");
  const [loc, setLoc] = useState<Loc | null>(null);
  const [score, setScore] = useState(0);
  const [paused, setPaused] = useState(false);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [frameError, setFrameError] = useState(false);
  const [frameTs, setFrameTs] = useState<string | null>(null);
  // ADR-042: R47c archived-after-silence, R47d guardian battery level.
  const [expiredSince, setExpiredSince] = useState<string | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const beat = useRef<ReturnType<typeof setInterval> | null>(null);
  // Fix lane D7 item 9 (founder Q125): the end action after her emergency word, as on the web
  // page: open (two steps), closed (greyed, 4+ guardians outside this guardian's group window)
  // or not shown. The server decides; checked on open, on each state change, and every 15 s
  // while the alarm is CRITICAL, because the group window moves with time.
  const [endMode, setEndMode] = useState<"none" | "open" | "closed">("none");
  const [endAsk, setEndAsk] = useState(false);
  const [endMsg, setEndMsg] = useState<string | null>(null);
  const [endCheckN, setEndCheckN] = useState(0);
  useEffect(() => {
    if (!journeyId) return;
    let gone = false;
    const check = async () => {
      try {
        const r = await guardian.endStatus(journeyId);
        if (!gone) setEndMode(r?.end === "open" || r?.end === "closed" ? r.end : "none");
      } catch (e) {
        console.warn("[monitor] end status failed", String((e as Error)?.message ?? e)); // keeps what it shows; next check retries
      }
    };
    void check();
    const t = state === "CRITICAL" ? setInterval(check, END_CHECK_MS) : null;
    return () => { gone = true; if (t) clearInterval(t); };
  }, [journeyId, state, endCheckN]);
  const endAlarm = async () => {
    setEndAsk(false);
    try {
      await guardian.endAlarm(journeyId);
      setEndMode("none");
      setEndMsg(i18n.t("guardian.monitor.endDone"));
    } catch (e) {
      console.warn("[monitor] end alarm refused or failed", String((e as Error)?.message ?? e));
      setEndMsg(i18n.t("guardian.monitor.endFailed"));
      setEndCheckN((n) => n + 1);
    }
  };

  useEffect(() => {
    if (!journeyId) return;
    let disposed = false;
    const hydrate = async () => {
      try {
        const snap = await guardian.snapshot(journeyId);
        if (disposed) return;
        setState(snap.state);
        if (snap.location && Number.isFinite(snap.location.lat) && Number.isFinite(snap.location.lng)) setLoc({ latitude: snap.location.lat, longitude: snap.location.lng });
        if (snap.heartbeat?.battery != null) setBattery(Math.round(Number(snap.heartbeat.battery) * 100));
        if (snap.frame) { setFrameUrl(snap.frame.url); setFrameTs(snap.frame.ts); setFrameError(false); }
      } catch { /* realtime can still provide updates; keep the explicit empty states */ }
    };
    void hydrate();
    // Heartbeat while this screen is mounted (foregrounded).
    guardian.heartbeat(journeyId);
    beat.current = setInterval(() => guardian.heartbeat(journeyId), HEARTBEAT_MS);

    const ch = supabase
      .channel?.(`monitor:${journeyId}`)
      ?.on?.("postgres_changes", { event: "*", schema: "public", table: "journey_state", filter: `journey_id=eq.${journeyId}` }, (m: any) => {
        if (m?.new?.state) setState(m.new.state);
      })
      ?.on?.("postgres_changes", { event: "INSERT", schema: "public", table: "locations", filter: `journey_id=eq.${journeyId}` }, (m: any) => {
        if (m?.new?.lat != null && m?.new?.lng != null) setLoc({ latitude: m.new.lat, longitude: m.new.lng });
      })
      ?.on?.("postgres_changes", { event: "INSERT", schema: "public", table: "events", filter: `journey_id=eq.${journeyId}` }, async (m: any) => {
        const row = m?.new;
        if (row?.type === "model_call" && row?.payload?.danger_score != null) setScore(Number(row.payload.danger_score));
        if (row?.type === "camera_pause") setPaused(true);
        if (row?.type === "camera_resume") setPaused(false);
        if (row?.type === "frame" && row?.payload?.path) {
          const { data, error } = await supabase.storage.from("frames").createSignedUrl(row.payload.path, 300);
          if (data?.signedUrl) { setFrameUrl(data.signedUrl); setFrameTs(row.ts ?? new Date().toISOString()); setFrameError(false); }
          else if (error) setFrameError(true);
        }
        // R47c: the alarm was archived after 15 min of silence — no live feed.
        if (row?.type === "alarm_expired") setExpiredSince(row?.payload?.last_seen ?? new Date().toISOString());
      })
      ?.on?.("postgres_changes", { event: "INSERT", schema: "public", table: "heartbeats", filter: `journey_id=eq.${journeyId}` }, (m: any) => {
        if (m?.new?.battery != null) setBattery(Math.round(Number(m.new.battery) * 100));
      });
    ch?.subscribe?.();

    return () => {
      if (beat.current) clearInterval(beat.current);
      if (ch) supabase.removeChannel?.(ch);
      disposed = true;
    };
  }, [journeyId]);

  const g = SCORE[Math.max(0, Math.min(3, score))];

  return (
    <Screen scroll padded topInset={false} testID="monitor-screen">
      <View style={{ gap: 14, paddingTop: 8, paddingBottom: 40 }}>
        {/* Phase 3: plain title row; the sole back control is the top-bar one.
            Designer fix: the name gets flexShrink:1 so a long owner name wraps
            and the StatusChip stays on-screen on the same row. */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text variant="title" color="primary" accessibilityRole="header" style={{ flexShrink: 1 }}>{name}</Text>
          <StatusChip state={state as any} />
        </View>

        {endMode === "open" ? (
          <Card testID="monitor-end" style={{ gap: 10 }}>
            {endAsk ? (
              <>
                <Text variant="bodyStrong" color="primary">{i18n.t("guardian.monitor.endQuestion")}</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button3D testID="monitor-end-confirm" full label={i18n.t("guardian.monitor.endConfirm")} onPress={() => void endAlarm()} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button3D testID="monitor-end-back" full variant="ghost" label={i18n.t("guardian.monitor.endBack")} onPress={() => setEndAsk(false)} />
                  </View>
                </View>
              </>
            ) : (
              <Button3D testID="monitor-end-start" full label={i18n.t("guardian.monitor.endStart")} onPress={() => { setEndMsg(null); setEndAsk(true); }} />
            )}
          </Card>
        ) : endMode === "closed" ? (
          <Card testID="monitor-end" style={{ gap: 8 }}>
            <Button3D testID="monitor-end-closed" full disabled label={i18n.t("guardian.monitor.endStart")} onPress={() => {}} />
            <Text variant="caption" color="muted">{i18n.t("guardian.monitor.endClosed")}</Text>
          </Card>
        ) : null}
        {endMsg ? <Text testID="monitor-end-msg" variant="bodyStrong" color="primary">{endMsg}</Text> : null}

        <Card style={{ padding: 0, overflow: "hidden", height: 240 }}>
          <MapView
            testID="monitor-map"
            style={{ flex: 1 }}
            region={loc ? { ...loc, latitudeDelta: 0.01, longitudeDelta: 0.01 } : undefined}
          >
            {loc ? <Marker testID="monitor-dot" coordinate={loc} title={name} /> : null}
          </MapView>
        </Card>

        {expiredSince ? (
          <Card testID="monitor-archived" style={{ gap: 6 }}>
            <Text variant="bodyStrong" color="primary">
              {i18n.t("guardian.monitor.archived", { time: new Date(expiredSince).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) })}
            </Text>
            <Button3D testID="monitor-call-112" full variant="danger" icon={Phone} label={i18n.t("guardian.detail.call112")} onPress={() => Linking.openURL(links.tel("112"))} />
          </Card>
        ) : null}

        {battery != null ? (
          <Text
            testID="monitor-battery"
            variant="caption"
            color={battery <= 20 ? d.chip.critical.fg : "muted"}
          >
            {i18n.t("guardian.monitor.battery", { n: battery })}
          </Text>
        ) : null}

        {!expiredSince ? (
        <Card style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text variant="bodyStrong" color="muted">{i18n.t("guardian.monitor.live")}</Text>
          <Chip testID="monitor-score" kind={g.kind} label={i18n.t(g.key)} dot />
        </Card>
        ) : null}

        {expiredSince ? null : paused ? (
          <Card testID="monitor-camera-paused" style={{ gap: 4 }}>
            <Text variant="bodyStrong" color="primary">{i18n.t("guardian.monitor.cameraPaused")}</Text>
            <Text variant="caption" color="muted">{i18n.t("guardian.monitor.cameraPausedHint")}</Text>
          </Card>
        ) : frameUrl ? (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <Image source={{ uri: frameUrl }} onError={() => { setFrameError(true); setFrameUrl(null); }} style={{ width: "100%", height: 200, borderRadius: 14 }} resizeMode="cover" testID="monitor-frame" />
          </Card>
        ) : (
          <Text variant="caption" color="faint" testID={frameError ? "monitor-frame-unavailable" : "monitor-noframe"}>
            {frameError ? i18n.t("guardian.monitor.frameUnavailable") : i18n.t("guardian.monitor.noFrame")}{frameTs ? ` · ${new Date(frameTs).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </Text>
        )}

        <View style={{ gap: 10 }}>
          <Button3D testID="monitor-check" full icon={Eye} label={i18n.t("guardian.detail.checkOnHer")} onPress={() => guardian.checkOnHer(journeyId)} />
          {params.phone ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button3D testID="monitor-call" full variant="ghost" icon={Phone} label={i18n.t("guardian.detail.call")} onPress={() => Linking.openURL(links.tel(String(params.phone)))} />
              </View>
              <View style={{ flex: 1 }}>
                <Button3D testID="monitor-whatsapp" full variant="ghost" icon={MessageCircle} label={i18n.t("guardian.detail.whatsapp")} onPress={() => Linking.openURL(links.whatsapp(String(params.phone)))} />
              </View>
            </View>
          ) : null}
          <Button3D testID="monitor-sos" full variant="danger" icon={Siren} label={i18n.t("guardian.detail.raiseSos")} onPress={() => router.navigate({ pathname: "/(guardian)/sos", params: { journeyId, name } })} />
        </View>
      </View>
    </Screen>
  );
}
