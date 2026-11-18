import { useEffect, useMemo, useRef, useState } from "react";
import { View, Pressable, Platform, Alert, ActivityIndicator, Linking } from "react-native";
import { useRouter, useNavigation } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { AudioModule } from "expo-audio";
import * as Location from "expo-location";
import * as Battery from "expo-battery";
import DateTimePicker from "@react-native-community/datetimepicker";
import { GooglePlacesAutocomplete, type GooglePlacesAutocompleteRef } from "react-native-google-places-autocomplete";
import { Crosshair, Camera as CameraIcon, RefreshCw, Clock } from "lucide-react-native";
import { normalisePlate } from "@vaira/core";
import { useTheme } from "../../../src/theme";
import { Screen } from "../../../src/components/Screen";
import { Text } from "../../../src/components/Text";
import { Field } from "../../../src/components/Field";
import { Chip } from "../../../src/components/Chip";
import { Button3D } from "../../../src/components/Button3D";
import { CityPicker } from "../../../src/components/CityPicker";
import { SafeWordStrength } from "../../../src/components/SafeWordStrength";
import { createJourney, etaSeconds, hasGuardianWithEmail, isBlacklisted, isValidCoordinate, validateSafeWord, type Pt } from "../../../src/services/journey";
import { secureWords } from "../../../src/services/secureWords";
import { runner } from "../../../src/services/protocolRunner";
import { ensureJourneyPermissions, type JourneyPermStep } from "../../../src/lib/permissions";
import { feeds } from "../../../src/services/feeds";
import { events } from "../../../src/lib/events";
import { supabase } from "../../../src/lib/supabase";
import { useSession } from "../../../src/store/session";
import { CITY_OPTIONS, type CityKey } from "../../../src/lib/cities";
import i18n from "../../../src/i18n";

type Place = (Pt & { label: string }) | null;

const MODES: { slug: string; key: string }[] = [
  { slug: "public-transport", key: "journeyNew.modePublic" },
  { slug: "cab", key: "journeyNew.modeCab" },
  { slug: "auto", key: "journeyNew.modeAuto" },
  { slug: "pool", key: "journeyNew.modePool" },
  { slug: "colleague", key: "journeyNew.modeColleague" },
  { slug: "walking", key: "journeyNew.modeWalking" },
];

// Human string for the monitoring cap (ADR-039): min(3×ETA + 30 min, 8 h).
function capText(etaSec: number): string {
  const cap = Math.min(3 * etaSec + 1800, 8 * 3600);
  const h = Math.floor(cap / 3600);
  const m = Math.round((cap % 3600) / 60);
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

export default function JourneyNewScreen() {
  const { p } = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const userId = useSession((s) => s.userId);
  const [salt, setSalt] = useState("");
  // Places autocomplete now proxies through the api (R40): the server injects the
  // key, so the phone only forwards the user's bearer token. Read once on mount.
  const [accessToken, setAccessToken] = useState("");
  const [emergencyWords, setEmergencyWords] = useState<string[]>([]);
  const [usedWords, setUsedWords] = useState<string[]>([]);
  const [camPerm, requestCamPerm] = useCameraPermissions();

  const [city, setCity] = useState<CityKey>("bengaluru");
  const [from, setFrom] = useState<Place>(null);
  const [fromText, setFromText] = useState("");
  const [to, setTo] = useState<Place>(null);
  const [leavingNow, setLeavingNow] = useState(true);
  const [startAt, setStartAt] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  // F20 (b16): Android's community datetimepicker has no "datetime" mode, so it
  // errored and blanked the screen. Run date then time as two dialogs on Android;
  // iOS keeps the single "datetime" spinner. pendingDate holds the date leg.
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");
  const pendingDate = useRef(new Date());
  const [pastTime, setPastTime] = useState(false);
  const [mode, setMode] = useState("cab");
  const [plate, setPlate] = useState("");
  const [safeWord, setSafeWord] = useState("");
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [blacklisted, setBlacklisted] = useState(false);
  const [overrideBlacklist, setOverrideBlacklist] = useState(false);
  const [dangerZone, setDangerZone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // F4/D17: reflect a live reroute failure while this plan sheet is open so it is
  // no longer silent — the feed reports it, the sheet shows one reassuring line.
  const [routeFailed, setRouteFailed] = useState<boolean>(!!feeds.getRouteError());
  // G5/F16: "Use current location" failure, no longer silent. The reason drives a
  // specific message (permission denied / location off / no fix yet).
  const [locError, setLocError] = useState<null | "permission" | "servicesOff" | "noFix">(null);
  const [locating, setLocating] = useState(false); // F16: spinner on the control while resolving
  // J1: the journey foreground service is location|microphone (R35); Android 14+
  // throws natively if RECORD_AUDIO is not granted when it starts. Block arming
  // here — with a visible, translated line — rather than let the service crash.
  const [micDenied, setMicDenied] = useState(false);
  // F18: journey permissions that are permanently denied (canAskAgain false), so
  // a system prompt is no longer possible and the settings sheet is the only path.
  const [permBlocked, setPermBlocked] = useState<JourneyPermStep[]>([]);
  const [chargePct, setChargePct] = useState<number | null>(null); // R47d charge nudge
  const [chargeAcked, setChargeAcked] = useState(false);
  const camRef = useRef<CameraView | null>(null);
  const fromPlacesRef = useRef<GooglePlacesAutocompleteRef | null>(null);

  useEffect(() => {
    const unsub = feeds.subscribeRouteError((e) => setRouteFailed(!!e));
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? ""));
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("word_salt").eq("id", userId).single();
      setSalt(data?.word_salt ?? "");
      setEmergencyWords(await secureWords.get("emergency"));
      setUsedWords(await secureWords.get("are_you_safe"));
    })();
  }, [userId]);

  // G7: guard against losing a part-filled plan. A ref keeps the latest "dirty"
  // value so the hardware-back listener (registered once) always sees it.
  const formDirty = Boolean(from || to || plate || safeWord || selfieUri);
  const dirtyRef = useRef(formDirty);
  dirtyRef.current = formDirty;
  // Founder 2026-10-15 (1-A): the ONLY back control is the top-bar arrow. Set on
  // a successful submit so the hand-off navigation is not caught by the guard.
  const savedRef = useRef(false);

  // G7 + 1-A: intercept the screen being removed — top-bar back, hardware back
  // AND the iOS swipe all raise `beforeRemove`. When the form has unsaved
  // entries, block once and confirm with the SAME Discard dialog (there is no
  // BackHandler path any more, so the dialog can never show twice). A clean or
  // already-saved form leaves without a prompt.
  useEffect(() => {
    const sub = navigation.addListener("beforeRemove", (e) => {
      if (!dirtyRef.current || savedRef.current) return;
      e.preventDefault();
      Alert.alert(i18n.t("journeyNew.discardTitle"), i18n.t("journeyNew.discardBody"), [
        { text: i18n.t("journeyNew.keepEditing"), style: "cancel" },
        { text: i18n.t("journeyNew.discard"), style: "destructive", onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return sub;
  }, [navigation]);

  const cityCentre = useMemo<Pt>(() => {
    const c = CITY_OPTIONS.find((o) => o.value === city)!;
    return { lat: c.lat, lng: c.lng };
  }, [city]);

  const eta = useMemo(() => etaSeconds(from ?? cityCentre, to ?? cityCentre), [from, to, cityCentre]);
  const swVerdict = safeWord ? validateSafeWord(safeWord, emergencyWords) : null;
  const usedBefore = safeWord ? usedWords.map((w) => w.toLowerCase()).includes(safeWord.toLowerCase()) : false;

  // G5/F16: resolve the current location reliably on a real phone. Balanced
  // accuracy + an 8 s cap so it does not hang indoors, a last-known fallback
  // (<= 5 min old), a spinner while it runs, and a specific message for each
  // failure. Every outcome is logged as `location_resolve` so the hosted events
  // table shows what actually happened on the phone.
  async function useCurrentLocation(set: (p: Place) => void) {
    setLocError(null);
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        setLocError("permission");
        void events.log("location_resolve", { outcome: "permission_denied" });
        return;
      }
      const servicesOn = await Location.hasServicesEnabledAsync?.().catch(() => true) ?? true;
      if (!servicesOn) {
        setLocError("servicesOff");
        void events.log("location_resolve", { outcome: "services_off" });
        return;
      }
      const TIMEOUT = Symbol("timeout");
      const race = await Promise.race<{ coords: { latitude: number; longitude: number } } | typeof TIMEOUT>([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<typeof TIMEOUT>((resolve) => setTimeout(() => resolve(TIMEOUT), 8000)),
      ]);
      let fix = race === TIMEOUT ? null : race;
      let fromCache = false;
      if (!fix && typeof Location.getLastKnownPositionAsync === "function") {
        fix = await Location.getLastKnownPositionAsync({ maxAge: 300000 }).catch(() => null);
        fromCache = !!fix;
      }
      if (!fix) {
        setLocError("noFix");
        void events.log("location_resolve", { outcome: "no_fix" });
        return;
      }
      const point = { lat: fix.coords.latitude, lng: fix.coords.longitude };
      if (!isValidCoordinate(point)) {
        setLocError("noFix");
        void events.log("location_resolve", { outcome: "invalid_coordinates" });
        return;
      }
      const label = i18n.t("journeyNew.currentLocation");
      set({ ...point, label });
      setFromText(label);
      // Keep the provider's actual input synchronized with the payload state;
      // the caption alone is not the visible From field.
      fromPlacesRef.current?.setAddressText(label);
      void events.log("location_resolve", { outcome: fromCache ? "last_known" : "fresh_fix" });
    } catch (e) {
      setLocError("noFix");
      void events.log("location_resolve", { outcome: "error", message: (e as Error)?.message });
    } finally {
      setLocating(false);
    }
  }

  async function capture() {
    const shot = await camRef.current?.takePictureAsync?.();
    if (shot?.uri) {
      setSelfieUri(shot.uri);
      setShowCamera(false);
    }
  }

  // A journey must carry the actual user-selected/resolved origin. Never turn
  // a missing GPS/place value into the city's centre in the persisted payload.
  const [needGuardian, setNeedGuardian] = useState(false);
  const canSubmit = Boolean(from && selfieUri && to && safeWord && swVerdict?.ok && (!blacklisted || overrideBlacklist) && !submitting);

  async function submit(skipCharge = false) {
    if (!userId || !selfieUri) return;
    // ADR-042/R47d: a non-blocking charge nudge when leaving on a low battery. The
    // sheet's Continue re-enters submit(true), so it never blocks the journey.
    if (!skipCharge && !chargeAcked) {
      const lvl = await Battery.getBatteryLevelAsync().catch(() => 1);
      const pct = Math.round(lvl * 100);
      if (lvl >= 0 && pct <= 20) { setChargePct(pct); return; }
    }
    // F18: ask for location, mic, camera and notifications right here (system
    // dialogs, in order, only for ones not already granted). If an essential one
    // is permanently denied, show the settings sheet; otherwise arm with whatever
    // was granted (refused camera/mic still surface their off pills on the map).
    setPermBlocked([]);
    const { blocked } = await ensureJourneyPermissions();
    if (blocked.length) { setPermBlocked(blocked); return; }
    // J1: a journey may only arm once we can hear her safe word. If the mic
    // permission was revoked after onboarding, the location|microphone FGS would
    // crash natively on Android 14+ — refuse to arm and show the reason instead.
    if (!(await AudioModule.getRecordingPermissionsAsync().catch(() => ({ granted: false }))).granted) {
      setMicDenied(true);
      return;
    }
    setMicDenied(false);
    setSubmitting(true);
    setError(null);
    try {
      // Founder Q123, Q124: checked afresh on every press, so an email added since counts.
      const hasGuardian = await hasGuardianWithEmail(userId);
      setNeedGuardian(!hasGuardian);
      if (!hasGuardian) {
        setSubmitting(false);
        return;
      }
      // T1: gate on the blacklist BEFORE writing anything. A blacklisted vehicle
      // must never start a monitored journey; surface the banner and stop.
      if (plate && !overrideBlacklist && (await isBlacklisted(plate))) {
        setBlacklisted(true);
        setSubmitting(false);
        return; // user chooses another vehicle or overrides, then re-submits
      }
      if (!from || !to) {
        setError(i18n.t("journeyNew.createError"));
        setSubmitting(false);
        return;
      }
      const fromPt = from;
      const toPt = to;
      if (!isValidCoordinate(fromPt) || !isValidCoordinate(toPt)) {
        setError(i18n.t("journeyNew.createError"));
        setSubmitting(false);
        return;
      }
      const res = await createJourney(userId, salt, {
        from: fromPt,
        to: toPt,
        startAt,
        leavingNow,
        mode,
        plate: plate || undefined,
        safeWord,
        selfieUri,
      });
      setDangerZone(res.dangerZone);
      // Arm the (stub) runner with the full row, then hand off to the dashboard.
      const { data: row } = await supabase.from("journeys_v").select("*").eq("id", res.id).single();
      runner.send({ type: "ARM", journey: row ?? { id: res.id } });
      savedRef.current = true; // allow the hand-off nav past the beforeRemove guard
      router.replace("/(user)/home");
    } catch (e) {
      const msg = String((e as Error)?.message ?? "");
      // ADR-039 daily-quota hard stop: do not start; show the fixed copy.
      setError(/quota|limit/i.test(msg) ? i18n.t("journeyNew.quotaReached") : i18n.t("journeyNew.createError"));
      setSubmitting(false);
    }
  }

  return (
    <Screen scroll padded topInset={false} testID="journey-new">
      {/* Phase 3b: the form's own back link was removed; the top-bar arrow is the
          only back control. Unsaved entries are guarded by the beforeRemove
          interceptor above. */}
      <Text variant="title" color="primary" accessibilityRole="header" style={{ marginTop: 12, marginBottom: 4 }}>
        {i18n.t("journeyNew.title")}
      </Text>

      <Text variant="label" color="muted" style={{ marginTop: 12, marginBottom: 6 }}>
        {i18n.t("journeyNew.cityLabel")}
      </Text>
      <CityPicker value={city} onChange={setCity} />

      {/* Route */}
      <Text variant="label" color="muted" style={{ marginTop: 16, marginBottom: 6 }}>
        {i18n.t("journeyNew.from")}
      </Text>
      <View style={{ gap: 8 }}>
        <GooglePlacesAutocomplete
          ref={fromPlacesRef}
          placeholder={i18n.t("journeyNew.fromPlaceholder")}
          fetchDetails
          query={{ language: "en", components: "country:in" }}
          requestUrl={{ useOnPlatform: "all", url: `${process.env.EXPO_PUBLIC_API_URL}/api/places`, headers: { authorization: `Bearer ${accessToken}` } }}
          textInputProps={{
            testID: "journey-from",
            value: fromText,
            onChangeText: (text: string) => {
              setFromText(text);
              // Manual edits invalidate a previously resolved GPS/place origin;
              // never submit coordinates for text the user has since changed.
              if (from && text !== from.label) setFrom(null);
            },
          }}
          onPress={(data, details) => {
            const g = details?.geometry?.location;
            if (g) {
              const label = data?.description ?? "";
              setFrom({ lat: g.lat, lng: g.lng, label });
              setFromText(label);
            }
          }}
        />
        <Pressable
          testID="journey-from-current"
          accessibilityRole="button"
          accessibilityLabel={i18n.t("journeyNew.useCurrent")}
          onPress={() => useCurrentLocation(setFrom)}
          disabled={locating}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}
        >
          {locating ? <ActivityIndicator size="small" color={p.brand} testID="journey-location-spinner" /> : <Crosshair size={16} color={p.brand} strokeWidth={2} />}
          <Text variant="caption" color={p.brand}>
            {i18n.t(locating ? "journeyNew.locating" : "journeyNew.useCurrent")}
          </Text>
        </Pressable>
        {from ? <Text variant="caption" color="muted">{from.label}</Text> : null}
        {locError ? (
          <Text testID="journey-location-error" variant="caption" color={p.stateDanger}>
            {i18n.t(`journeyNew.locError.${locError}`)}
          </Text>
        ) : null}
      </View>

      <Text variant="label" color="muted" style={{ marginTop: 16, marginBottom: 6 }}>
        {i18n.t("journeyNew.to")}
      </Text>
      <GooglePlacesAutocomplete
        placeholder={i18n.t("journeyNew.toPlaceholder")}
        fetchDetails
        query={{ language: "en", components: "country:in" }}
        requestUrl={{ useOnPlatform: "all", url: `${process.env.EXPO_PUBLIC_API_URL}/api/places`, headers: { authorization: `Bearer ${accessToken}` } }}
        textInputProps={{ testID: "journey-to" }}
        onPress={(data, details) => {
          const g = details?.geometry?.location;
          if (g) setTo({ lat: g.lat, lng: g.lng, label: data?.description ?? "" });
        }}
      />
      {to ? <Text variant="caption" color="muted">{to.label}</Text> : null}

      {dangerZone ? (
        <View testID="journey-dangerzone" style={{ marginTop: 10 }}>
          <Chip kind="amber" label={i18n.t("journeyNew.dangerZone")} />
        </View>
      ) : null}

      {/* When */}
      <Text variant="label" color="muted" style={{ marginTop: 16, marginBottom: 6 }}>
        {i18n.t("journeyNew.when")}
      </Text>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Pressable
          testID="journey-leaving-now"
          accessibilityRole="button"
          accessibilityState={{ selected: leavingNow }}
          onPress={() => setLeavingNow(true)}
        >
          <Chip kind={leavingNow ? "safe" : "neutral"} label={i18n.t("journeyNew.leavingNow")} />
        </Pressable>
        <Pressable
          testID="journey-schedule"
          accessibilityRole="button"
          accessibilityState={{ selected: !leavingNow }}
          onPress={() => {
            setLeavingNow(false);
            setPickerMode("date");
            setPastTime(false);
            setShowPicker(true);
          }}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Clock size={16} color={p.textMuted} strokeWidth={2} />
          <Text variant="caption" color="muted">
            {leavingNow ? i18n.t("journeyNew.scheduleLater") : startAt.toLocaleString()}
          </Text>
        </Pressable>
      </View>
      {showPicker ? (
        <DateTimePicker
          testID="journey-datetime"
          value={pickerMode === "time" ? pendingDate.current : startAt}
          mode={Platform.OS === "ios" ? "datetime" : pickerMode}
          onChange={(e, d2) => {
            if (Platform.OS !== "ios") {
              // Android: dismissing either dialog cancels the whole flow.
              if (e.type === "dismissed") { setShowPicker(false); setPickerMode("date"); return; }
              if (pickerMode === "date" && d2) {
                pendingDate.current = d2; // keep the chosen day; ask for the time next
                setPickerMode("time");
                return; // showPicker stays true, re-renders in time mode
              }
              if (pickerMode === "time" && d2) {
                const merged = new Date(pendingDate.current);
                merged.setHours(d2.getHours(), d2.getMinutes(), 0, 0);
                const past = merged.getTime() < Date.now();
                setPastTime(past);
                setStartAt(past ? new Date() : merged); // F20: never schedule a past time
                setShowPicker(false);
                setPickerMode("date");
              }
              return;
            }
            // iOS single datetime spinner.
            setShowPicker(false);
            if (d2) {
              const past = d2.getTime() < Date.now();
              setPastTime(past);
              setStartAt(past ? new Date() : d2);
            }
          }}
        />
      ) : null}
      {pastTime && !leavingNow ? (
        <Text testID="journey-past-time" variant="caption" color={p.stateDanger} style={{ marginTop: 6 }}>
          {i18n.t("journeyNew.pastTime")}
        </Text>
      ) : null}

      <Text testID="journey-cap" variant="caption" color="muted" style={{ marginTop: 8 }}>
        {i18n.t("journeyNew.monitoringCap", { cap: capText(eta) })}
      </Text>

      {routeFailed ? (
        <Text testID="journey-route-error" variant="caption" color={p.stateDanger} style={{ marginTop: 8 }}>
          {i18n.t("journeyNew.routeError")}
        </Text>
      ) : null}

      {/* Mode */}
      <Text variant="label" color="muted" style={{ marginTop: 16, marginBottom: 6 }}>
        {i18n.t("journeyNew.mode")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {MODES.map((m) => (
          <Pressable
            key={m.slug}
            testID={`journey-mode-${m.slug}`}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m.slug }}
            onPress={() => setMode(m.slug)}
          >
            <Chip kind={mode === m.slug ? "safe" : "neutral"} label={i18n.t(m.key)} />
          </Pressable>
        ))}
      </View>

      {/* Vehicle */}
      <View style={{ marginTop: 16 }}>
        <Field
          label={i18n.t("journeyNew.plate")}
          value={plate}
          onChangeText={setPlate}
          autoCapitalize="characters"
          placeholder="MH 01 AB 1234"
          testID="journey-plate"
          onSubmitEditing={() => setPlate((v) => (v ? normalisePlate(v) : v))}
        />
      </View>
      {blacklisted ? (
        <View testID="journey-blacklist" style={{ gap: 8, marginBottom: 12 }}>
          <Chip kind="danger" label={i18n.t("journeyNew.blacklisted")} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button3D
              label={i18n.t("journeyNew.chooseAnother")}
              variant="ghost"
              onPress={() => {
                setPlate("");
                setBlacklisted(false);
                setOverrideBlacklist(false);
              }}
              testID="journey-blacklist-choose"
            />
            <Button3D
              label={i18n.t("journeyNew.continueAnyway")}
              variant="pill"
              onPress={() => setOverrideBlacklist(true)}
              testID="journey-blacklist-continue"
            />
          </View>
        </View>
      ) : null}

      {/* Safe word */}
      <View style={{ marginTop: 4 }}>
        {/* G8: the safe word gates arming, so mark it required (label asterisk + helper). */}
        <Field
          label={`${i18n.t("journeyNew.safeWord")} *`}
          value={safeWord}
          onChangeText={setSafeWord}
          autoCapitalize="none"
          placeholder={i18n.t("journeyNew.safeWordPlaceholder")}
          testID="journey-safeword"
          error={swVerdict && !swVerdict.ok ? i18n.t(`journeyNew.swReason.${swVerdict.reason}`) : null}
        />
        <Text testID="journey-safeword-required" variant="caption" color="muted">
          {i18n.t("journeyNew.safeWordRequired")}
        </Text>
        {safeWord ? <SafeWordStrength word={safeWord} /> : null}
        {usedBefore ? (
          <Text testID="journey-safeword-used" variant="caption" color="muted" style={{ marginTop: 6 }}>
            {i18n.t("journeyNew.safeWordUsed")}
          </Text>
        ) : null}
      </View>

      {/* Selfie */}
      <Text variant="label" color="muted" style={{ marginTop: 16, marginBottom: 6 }}>
        {i18n.t("journeyNew.selfie")}
      </Text>
      {showCamera && camPerm?.granted ? (
        <View style={{ gap: 8 }}>
          <CameraView ref={(r) => { camRef.current = r; }} facing="front" style={{ width: "100%", height: 320, borderRadius: 16 }} />
          <Button3D label={i18n.t("journeyNew.takeSelfie")} icon={CameraIcon} onPress={capture} testID="selfie-capture" full />
        </View>
      ) : selfieUri ? (
        <View style={{ gap: 8 }}>
          <Text variant="caption" color="muted">{i18n.t("journeyNew.selfieDone")}</Text>
          <Button3D
            label={i18n.t("journeyNew.retake")}
            icon={RefreshCw}
            variant="ghost"
            onPress={() => {
              setSelfieUri(null);
              setShowCamera(true);
            }}
            testID="selfie-retake"
          />
        </View>
      ) : (
        <Button3D
          label={i18n.t("journeyNew.openCamera")}
          icon={CameraIcon}
          onPress={async () => {
            if (!camPerm?.granted) await requestCamPerm();
            setShowCamera(true);
          }}
          testID="selfie-capture"
          full
        />
      )}

      {error ? (
        <Text testID="journey-error" variant="caption" color={p.stateDanger} style={{ marginTop: 12 }}>
          {error}
        </Text>
      ) : null}

      {chargePct != null && !chargeAcked ? (
        <View testID="charge-sheet" style={{ marginTop: 16, gap: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: p.brand, backgroundColor: p.brandSoft }}>
          <Text variant="bodyStrong" color="primary">{i18n.t("battery.chargeBeforeTitle")}</Text>
          <Text variant="body" color="muted" testID="charge-sheet-body">{i18n.t("battery.chargeBefore", { n: chargePct })}</Text>
          <Button3D label={i18n.t("battery.continue")} testID="charge-continue" full onPress={() => { setChargeAcked(true); void submit(true); }} />
        </View>
      ) : null}

      {micDenied ? (
        <Text testID="journey-mic-required" variant="caption" color={p.stateDanger} style={{ marginTop: 12 }}>
          {i18n.t("journeyNew.micRequired")}
        </Text>
      ) : null}

      {permBlocked.length ? (
        <View testID="journey-perm-sheet" style={{ marginTop: 16, gap: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: p.stateDanger, backgroundColor: p.brandSoft }}>
          <Text variant="bodyStrong" color="primary">{i18n.t("journeyNew.permBlockedTitle")}</Text>
          <Text variant="body" color="muted">
            {i18n.t("journeyNew.permBlockedBody", { perms: permBlocked.map((s) => i18n.t(`journeyNew.perm.${s}`)).join(", ") })}
          </Text>
          <Button3D label={i18n.t("journeyNew.openSettings")} testID="journey-open-settings" full onPress={() => { void Linking.openSettings(); }} />
        </View>
      ) : null}

      {needGuardian ? (
        <View testID="journey-need-guardian" style={{ marginTop: 16, gap: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: p.stateDanger }}>
          <Text variant="body">{i18n.t("journeyNew.needGuardianEmail")}</Text>
          <Button3D label={i18n.t("journeyNew.addGuardianEmail")} testID="journey-add-guardian" full onPress={() => router.push("/(user)/profile/guardians")} />
        </View>
      ) : null}

      <View style={{ marginTop: 20, gap: 8 }}>
        <Button3D label={i18n.t("journeyNew.start")} onPress={() => submit()} disabled={!canSubmit} loading={submitting} testID="journey-start" full />
        <Text variant="caption" color="muted">
          {i18n.t("journeyNew.consentCaption")}
        </Text>
      </View>
    </Screen>
  );
}
