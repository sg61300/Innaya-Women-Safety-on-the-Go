import { useEffect, useRef, useState } from "react";
import { View, ScrollView, Image, Pressable, Linking, AccessibilityInfo } from "react-native";
import { useScrollTopOnFocus } from "../../src/lib/useScrollTopOnFocus";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { HelpCircle, Phone, Video, X } from "lucide-react-native";
import type { ProtocolState } from "@vaira/core";
import { useTheme, darkenUntil } from "../../src/theme";
import { Text } from "../../src/components/Text";
import { Card } from "../../src/components/Card";
import { Button3D } from "../../src/components/Button3D";
import { IconButton } from "../../src/components/IconButton";
import { GuardianRing, type RingState } from "../../src/components/GuardianRing";
import { StatusChip } from "../../src/components/StatusChip";
import { VoiceFab, FAB_INSET } from "../../src/components/VoiceFab";
import { JourneyCard } from "../../src/components/JourneyCard";
import { GradientBand, BAND_INK } from "../../src/components/GradientBand";
import { Illustration } from "../../src/components/Illustration";
import { TourTarget, useTour, useTourScroller } from "../../src/components/tour/TourProvider";
import { useJourney } from "../../src/store/journey";
import { runner } from "../../src/services/protocolRunner";
import { supabase } from "../../src/lib/supabase";
import { permissionsSummary, requestStep } from "../../src/lib/permissions";
import { audio } from "../../src/services/audio";
import { links } from "../../src/lib/links";
import i18n from "../../src/i18n";

const emblem = require("../../assets/brand/emblem.png");
const supportArtwork = require("../../assets/illustrations/support-card.png");
// F4: the physical-jewellery collection (external products site).
const PRODUCTS_URL = process.env.EXPO_PUBLIC_PRODUCTS_URL ?? "https://innaya-products.example.com/products";

// Design/02 §4.4: protocol state → living-ring colour band.
export function ringState(s: ProtocolState | "idle"): RingState {
  switch (s) {
    case "SAFE": case "RESOLVED": return "safe";
    case "AMBER": case "LATE_CHECK": case "RESOLVED_MONITORING": return "amber";
    case "EMERGENCY": return "emergency";
    case "CRITICAL": case "CANCEL_HOLD": return "critical";
    default: return "idle"; // IDLE / ARMED / idle
  }
}

function greetingKey(h: number): string {
  if (h < 12) return "home.greetMorning";
  if (h < 17) return "home.greetAfternoon";
  return "home.greetEvening";
}

export default function HomeScreen() {
  const { p, d } = useTheme();
  const router = useRouter();
  const tour = useTour();
  const ctx = useJourney((s) => s.ctx);
  const journey = useJourney((s) => s.journey);
  const battery = useJourney((s) => s.battery);
  const lite = useJourney((s) => s.lite);

  const [firstName, setFirstName] = useState("");
  const [watchers, setWatchers] = useState(0);
  const [regionCount, setRegionCount] = useState<number | null>(null);
  const [regionError, setRegionError] = useState(false);
  const [toast, setToast] = useState(false);
  const [micPrompt, setMicPrompt] = useState(false);
  const [listening, setListening] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const homeAudioOwned = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  useScrollTopOnFocus(scrollRef); // F17: reset to top when the Home tab regains focus
  useTourScroller("/(user)/home", scrollRef); // F6: let the tour scroll targets into view

  // The hero ring is the brand's living element; animate it unless the user has
  // asked the OS to reduce motion. Read once on mount and track live changes.
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => { if (alive) setReduceMotion(on); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (on: boolean) => setReduceMotion(on));
    return () => { alive = false; sub?.remove?.(); };
  }, []);

  // First-login toast: shown once, flagged in storage so it never repeats.
  useEffect(() => {
    AsyncStorage.getItem("vaira.firstLoginShown").then((v) => {
      if (!v) { setToast(true); AsyncStorage.setItem("vaira.firstLoginShown", "1").catch(() => {}); }
    }).catch(() => {});
  }, []);

  // First-mount tour (R38): start once, after a short settle delay, when never
  // seen. Guarded by startedRef and depending on [] so provider re-renders during
  // an active tour (measure() re-sets rect every 100 ms → new context object)
  // can never reschedule/restart it — otherwise start() resets to step 0 every
  // ~400 ms and the walk can never advance. tourRef keeps start() current without
  // making tour a dependency; cancelled drops the timer if we unmount mid-fetch.
  const startedRef = useRef(false);
  const tourRef = useRef(tour);
  tourRef.current = tour;
  useEffect(() => {
    let id: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    AsyncStorage.getItem("vaira.tourSeen").then((v) => {
      if (!v && !startedRef.current && !cancelled) {
        startedRef.current = true;
        id = setTimeout(() => tourRef.current.start(), 400);
      }
    }).catch(() => {});
    return () => { cancelled = true; if (id) clearTimeout(id); };
  }, []);

  // Profile name + active-guardian count for the greeting and ring.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u?.user?.id;
        if (!uid) return;
        const { data: prof } = await supabase.from("profiles").select("name").eq("id", uid).single();
        if (!cancelled && prof?.name) setFirstName(String(prof.name).trim().split(/\s+/)[0]);
        const { count } = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("owner_id", uid);
        if (!cancelled && typeof count === "number") setWatchers(count);
      } catch (e) { console.warn("[home] profile load failed", e); }
    })();
    return () => { cancelled = true; };
  }, []);

  // On mount: ensure location permission, surface mic "just browsing?" prompt,
  // then count nearby unsafe regions (amber + red) within 4370 m.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sum = await permissionsSummary();
        if (!sum.location) await requestStep("location");
        if (!sum.mic && !cancelled) { setMicPrompt(true); setMicDenied(true); }
        const Location = require("expo-location");
        const pos = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = pos.coords;
        const { data } = await supabase.rpc("regions_near", { lat: latitude, lng: longitude, radius_m: 4370 });
        const rows = (data as { status?: string }[]) ?? [];
        if (!cancelled) { setRegionError(false); setRegionCount(rows.filter((r) => r.status === "red" || r.status === "amber").length); }
      } catch (e) { console.warn("[home] region count failed", e); if (!cancelled) { setRegionError(true); setRegionCount(null); } }
    })();
    return () => { cancelled = true; };
  }, []);

  // Home is only a voluntary, foreground listener. The journey foreground
  // service owns the same singleton audio pipeline, so never start a second
  // listener while a journey is active and release Home's listener on unmount.
  useEffect(() => () => {
    if (homeAudioOwned.current) {
      homeAudioOwned.current = false;
      void audio.stop();
    }
  }, []);

  const primaryPhone = async (): Promise<string | null> => {
    const { data: u } = await supabase.auth.getUser();
    const { data: c } = await supabase.from("contacts").select("phone")
      .eq("owner_id", u?.user?.id ?? "").eq("tier", "primary").order("position").limit(1).single();
    return c?.phone ?? null;
  };
  const guardianCall = async () => {
    try { const ph = await primaryPhone(); if (ph) Linking.openURL(links.tel(ph)).catch(() => {}); }
    catch (e) { console.warn("[home] guardian call failed", e); }
  };
  const guardianVideo = async () => {
    try { const ph = await primaryPhone(); if (ph) Linking.openURL(links.whatsapp(ph)).catch(() => {}); }
    catch (e) { console.warn("[home] guardian video failed", e); }
  };

  async function toggleHomeListening() {
    if (journey) return;
    if (listening) {
      await audio.stop();
      homeAudioOwned.current = false;
      setListening(false);
      return;
    }
    const granted = await requestStep("mic");
    if (granted !== "granted") {
      setMicDenied(true);
      return;
    }
    setMicDenied(false);
    try {
      await audio.start((kind, word) => runner.onKeyword(kind, word));
      homeAudioOwned.current = true;
      setListening(true);
    } catch (e) {
      console.warn("[home] microphone start failed", e);
      setMicDenied(true);
      setListening(false);
    }
  }

  // F3/D13: ONE guardian-count source for both the ring and the journey card.
  // All contacts are the user's guardians/trustees and a journey carries no
  // separate linked-guardian count, so the contact count is authoritative; the
  // card's own guardians field is overridden with it so the two never disagree.
  const guardianCount = watchers;

  const rState = ringState(ctx.state);
  const statusState = ctx.state === "IDLE" ? "idle" : ctx.state;
  const now = new Date();

  // Quick-action face colours pass the same darkenUntil contrast guard as d.btn
  // (white glyph/label = d.onPrimary), so they never fail 4.5:1 in any palette.
  const callColor = darkenUntil(p.stateSafe, d.onPrimary);
  const videoColor = darkenUntil(p.teal, d.onPrimary);

  return (
    <View style={{ flex: 1, backgroundColor: p.bgBase }}>
      {/* D7: base bottom padding + the shared FAB_INSET clearance so the mic FAB
          never overlaps the last card (e.g. the journey card's "Change time or
          route"). FAB_INSET is the single source shared with (setup)/profile. */}
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 68 + FAB_INSET, gap: 16 }} testID="home-scroll">
        {/* b14: a gradient header band carries the greeting in serif display, with
            the help/tour control on the right (white on the plum wash). The emblem
            + wordmark stay in the sticky <AppHeader/> (layout). */}
        <GradientBand style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 22, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text variant="caption" color={BAND_INK}>{i18n.t(greetingKey(now.getHours()))}</Text>
              {firstName ? <Text variant="displaySerif" color={BAND_INK} style={{ marginTop: 2 }}>{firstName}</Text> : null}
            </View>
            <TourTarget id="tourButton">
              <IconButton icon={HelpCircle} label={i18n.t("home.help")} testID="home-help" onPress={() => tour.start()}
                tint={BAND_INK} bg="rgba(255,255,255,0.18)" />
            </TourTarget>
          </View>
        </GradientBand>

        <View style={{ paddingHorizontal: 16, gap: 16 }}>
        {/* First-login toast */}
        {toast ? (
          <Pressable testID="home-toast" accessibilityRole="button" accessibilityLabel={i18n.t("dashboard.firstLogin")} onPress={() => setToast(false)}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: d.toast.bg, borderRadius: 14, padding: 12 }}>
            <Text variant="caption" color={d.toast.fg} style={{ flex: 1 }}>{i18n.t("dashboard.firstLogin")}</Text>
            <X size={16} color={d.toast.fg} />
          </Pressable>
        ) : null}

        {/* Ring + status */}
        <TourTarget id="ring" style={{ alignItems: "center", gap: 10 }}>
          {/* F4: the guardian circle is tappable — it opens the guardians list. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i18n.t("home.openGuardians")}
            testID="ring-guardians"
            onPress={() => router.navigate("/(user)/profile?section=guardians")}
          >
            <GuardianRing state={rState} guardians={guardianCount} emblem={emblem} reduceMotion={reduceMotion} />
          </Pressable>
          <StatusChip state={statusState} startAt={journey?.startAt} />
        </TourTarget>

        {/* Quick actions. Voice listening has one dedicated floating control below;
            keeping it out of this row gives Call and Video enough width to stay
            readable on small phones. */}
        <TourTarget id="quickActions" testID="home-quick-actions" style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Button3D full variant="pill" icon={Phone} color={callColor} label={i18n.t("home.callGuardian")} onPress={guardianCall} testID="quick-call" />
          </View>
          <View style={{ flex: 1 }}>
            <Button3D full variant="pill" icon={Video} color={videoColor} label={i18n.t("home.videoCheck")} onPress={guardianVideo} testID="quick-video" />
          </View>
        </TourTarget>

        {micDenied && !micPrompt ? (
          <Text testID="mic-denied" variant="caption" color={p.stateDanger}>
            {i18n.t("home.micPermissionRequired")}
          </Text>
        ) : null}

        {/* Mic "just browsing?" prompt */}
        {micPrompt ? (
          <Card testID="mic-prompt">
            <Text variant="bodyStrong" style={{ marginBottom: 6 }}>{i18n.t("home.micPromptTitle")}</Text>
            <Text variant="caption" color="muted" style={{ marginBottom: 12 }}>{i18n.t("home.micPromptBody")}</Text>
            <Button3D variant="ghost" full label={i18n.t("home.noAudio")} onPress={() => setMicPrompt(false)} testID="mic-prompt-dismiss" />
          </Card>
        ) : null}

        {/* Journey card */}
        <TourTarget id="journeyCard">
          <JourneyCard
            journey={journey ? { ...journey, guardians: guardianCount } : null}
            state={statusState}
            lite={lite ? battery : null}
            onPlan={() => router.navigate("/(user)/journey/new")}
            onChange={() => { runner.send({ type: "PLAN_CHANGE" }); router.navigate("/(user)/journey/new?edit=1"); }}
            onEnd={() => runner.send({ type: "END" })}
            onArrived={() => runner.send({ type: "ARRIVED" })}
          />
        </TourTarget>
        {/* ADR-042/R47d: battery % while a journey is active. */}
        {journey && battery != null ? (
          <Text variant="caption" color={battery <= 20 ? d.chip.critical.fg : "muted"} testID="home-battery" style={{ marginTop: 6 }}>
            {i18n.t(lite ? "battery.lite" : "home.battery", { n: battery })}
          </Text>
        ) : null}

        {/* Two-column: unsafe regions + vitals */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Card variant="raised" testID="regions-summary" onPress={() => router.navigate("/(user)/regions")} style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <Text variant="label" color="muted" style={{ marginBottom: 6 }}>{i18n.t("home.unsafeRegions")}</Text>
              <Illustration name="class-map-pin" size={34} />
            </View>
            <Text variant="title" testID="regions-summary-value">{regionError ? i18n.t("home.cardError") : (regionCount ?? i18n.t("home.loading"))}</Text>
            <Text variant="caption" color="muted">{regionError ? i18n.t("home.tryAgain") : i18n.t("home.regionsNear")}</Text>
          </Card>
          <Card variant="raised" testID="vitals-summary" onPress={() => router.navigate("/(user)/profile/vitals")} style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <Text variant="label" color="muted" style={{ marginBottom: 6 }}>{i18n.t("home.vitals")}</Text>
              <Illustration name="vitals" size={34} />
            </View>
            <Text variant="caption" color="faint">{i18n.t("home.vitalsEmpty")}</Text>
          </Card>
        </View>

        {/* Self-defence */}
        <Card variant="raised" testID="defence-card" onPress={() => router.navigate("/(user)/defence")}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Illustration name="selfdefence-hero" size={44} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" style={{ marginBottom: 4 }}>{i18n.t("home.defenceTitle")}</Text>
              <Text variant="caption" color="muted">{i18n.t("home.defenceSub")}</Text>
            </View>
          </View>
        </Card>

        {/* F4: physical products — VAIRA jewellery collection (external site). */}
        <Card variant="raised" testID="products-card" onPress={() => Linking.openURL(PRODUCTS_URL).catch((e) => console.warn("[home] products link failed", e))}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Image source={emblem} style={{ width: 36, height: 36, resizeMode: "contain" }} accessibilityIgnoresInvertColors />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" style={{ marginBottom: 2 }}>{i18n.t("home.productsTitle")}</Text>
              <Text variant="caption" color="muted">{i18n.t("home.productsCta")}</Text>
            </View>
          </View>
        </Card>

        {/* Support and suggestions: always available at the bottom of Home. */}
        <Card variant="raised" testID="home-support-card" onPress={() => Linking.openURL(links.support()).catch((e) => console.warn("[home] support link failed", e))}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Image source={supportArtwork} style={{ width: 58, height: 58, borderRadius: 16 }} accessibilityIgnoresInvertColors />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" style={{ marginBottom: 2 }}>{i18n.t("support.title")}</Text>
              <Text variant="caption" color="muted">{i18n.t("support.subtitle")}</Text>
            </View>
          </View>
        </Card>
        </View>
      </ScrollView>

      <VoiceFab listening={listening} denied={micDenied} disabled={!!journey} accessibilityLabel={i18n.t(journey ? "home.micJourney" : micDenied ? "home.micPermissionRequired" : listening ? "home.micStop" : "home.micStart")} onToggle={() => void toggleHomeListening()} />
    </View>
  );
}
