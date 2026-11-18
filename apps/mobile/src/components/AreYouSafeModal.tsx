import { useEffect, useRef, useState } from "react";
import { Modal, View, TextInput } from "react-native";
import { CameraView } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { Chip } from "./Chip";
import { Button3D } from "./Button3D";
import { CountdownRing } from "./CountdownRing";
import { AreYouSafeLayout } from "./AreYouSafeLayout";
import { TYPE } from "../theme/typography";
import { useJourney, type Challenge } from "../store/journey";
import { runner } from "../services/protocolRunner";
import { events } from "../lib/events";
import i18n from "../i18n";

// Task 27 — the ARE-YOU-SAFE modal. It overlays every user screen (mounted in
// (user)/_layout) and is visible whenever the runner has opened a challenge in
// the store. It owns NO protocol logic: it renders the open challenge, ticks the
// countdown for display, and calls runner.resolveChallenge. The runner owns the
// 3 s speaker prompt and the 5 s CRITICAL deadline — the modal never escalates,
// so the countdown reaching 0 does nothing here (ADR-038/039/040).
const TICK_MS = 250;
const SPEAKER_MS = 3000;
const totalFor = (kind: Challenge["kind"]) => (kind === "arrival" ? 300 : 5);
// AreYouSafeLayout (V10) fits the plain safe-word check-ins; the pause/away/
// arrival kinds need a masked field, a secondary button, or a distinct title,
// so they render a small custom body below.
const PLAIN: Challenge["kind"][] = ["check", "stationary", "route"];

export function AreYouSafeModal() {
  const challenge = useJourney((s) => s.challenge);
  const cameraPaused = useJourney((s) => s.ctx.cameraPaused);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, setNow] = useState(Date.now());

  // Reset the typed field for each new challenge (identified by its deadline).
  useEffect(() => {
    setTyped("");
    setError(null);
  }, [challenge?.deadline]);

  // Tick for the countdown display only. No timer here ever calls the runner.
  useEffect(() => {
    if (!challenge) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [challenge?.deadline]);

  // Heavy haptic triple on open for every kind except pause (silent). Best effort.
  useEffect(() => {
    if (!challenge || challenge.kind === "pause") return;
    (async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch {
          break;
        }
      }
    })();
  }, [challenge?.deadline]);

  if (!challenge) return null;

  const total = totalFor(challenge.kind);
  const remainingMs = challenge.deadline - Date.now();
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const elapsedMs = total * 1000 - remainingMs;
  const speakerPromptFired = challenge.speakerPrompt && elapsedMs >= SPEAKER_MS;

  const submit = async () => {
    setError(null);
    if (!(await runner.resolveChallenge(typed))) setError(i18n.t("emergency.notRecognised"));
  };
  const danger = () => { setError(null); void runner.resolveChallenge("danger"); };
  const secondary = () => { setError(null); void runner.resolveChallenge("secondary"); };

  const plain = PLAIN.includes(challenge.kind);

  return (
    <Modal
      visible
      transparent={false}
      animationType="fade"
      onRequestClose={() => {}} // no dismiss: the challenge must be answered
      testID="areyousafe-modal"
    >
      {/* Front-camera challenge selfie (0 s + 3 s), skipped for pause. Never blocks. */}
      {challenge.kind !== "pause" ? <ChallengeSelfie key={challenge.deadline} /> : null}
      {plain ? (
        <AreYouSafeLayout
          seconds={seconds}
          total={total}
          typed={typed}
          onTyped={(value) => { setTyped(value); setError(null); }}
          onSafe={submit}
          onDanger={danger}
          speakerPromptFired={speakerPromptFired}
          error={error}
        />
      ) : (
        <CustomBody
          challenge={challenge}
          seconds={seconds}
          total={total}
          typed={typed}
          onTyped={(value) => { setTyped(value); setError(null); }}
          onSubmit={submit}
          onDanger={danger}
          onSecondary={secondary}
          cameraPaused={!!cameraPaused}
          error={error}
        />
      )}
    </Modal>
  );
}

// pause / away / arrival body. Same testIDs as AreYouSafeLayout so tests treat
// every kind uniformly (areyousafe-input / -confirm / -danger).
function CustomBody({
  challenge,
  seconds,
  total,
  typed,
  onTyped,
  onSubmit,
  onDanger,
  onSecondary,
  cameraPaused,
  error,
}: {
  challenge: Challenge;
  seconds: number;
  total: number;
  typed: string;
  onTyped: (v: string) => void;
  onSubmit: () => void;
  onDanger: () => void;
  onSecondary: () => void;
  cameraPaused: boolean;
  error: string | null;
}) {
  const { p, d } = useTheme();
  const kind = challenge.kind;
  const title =
    kind === "pause" ? i18n.t("areYouSafe.pauseTitle") : kind === "arrival" ? i18n.t("areYouSafe.arrivalTitle") : i18n.t("areYouSafe.title");

  // Pause while the camera is already off: show only the "Camera off" copy.
  if (kind === "pause" && cameraPaused) {
    return (
      <View style={{ flex: 1, backgroundColor: p.brandSoft, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
        <Text variant="display" testID="areyousafe-cameraoff">
          {i18n.t("areYouSafe.cameraOff")}
        </Text>
        <Text variant="body" color={p.textMuted}>
          {i18n.t("areYouSafe.cameraOffHint")}
        </Text>
      </View>
    );
  }

  const masked = kind === "pause";
  return (
    <View style={{ flex: 1, backgroundColor: p.brandSoft, alignItems: "center", justifyContent: "center", padding: 24, gap: 18 }}>
      <Chip kind={seconds <= 2 ? "critical" : "brand"} label={i18n.t(seconds <= 2 ? "areYouSafe.pillAlerting" : "areYouSafe.pillCheckIn")} dot />
      <CountdownRing seconds={seconds} total={total} urgentAt={2} />
      <View style={{ alignItems: "center", gap: 6 }}>
        <Text variant="display">{title}</Text>
        <Text variant="body" color={p.textMuted}>
          {i18n.t(masked ? "areYouSafe.pauseSub" : "areYouSafe.sub")}
        </Text>
      </View>

      <TextInput
        testID="areyousafe-input"
        accessibilityLabel={i18n.t("areYouSafe.placeholder")}
        value={typed}
        onChangeText={onTyped}
        placeholder={i18n.t("areYouSafe.placeholder")}
        placeholderTextColor={d.input.placeholder}
        secureTextEntry={masked}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          alignSelf: "stretch",
          minHeight: 52,
          paddingHorizontal: 16,
          borderRadius: 14,
          backgroundColor: d.input.bg,
          borderWidth: 1,
          borderColor: d.input.border,
          fontFamily: TYPE.body.fontFamily,
          fontSize: TYPE.body.fontSize,
          color: p.text,
        }}
      />
      {error ? <Text testID="areyousafe-error" variant="caption" color={d.sos}>{error}</Text> : null}

      <View style={{ alignSelf: "stretch", gap: 12 }}>
        <Button3D label={i18n.t("areYouSafe.safe")} onPress={onSubmit} full testID="areyousafe-confirm" />
        {kind === "away" ? (
          <Button3D label={i18n.t("areYouSafe.changeDestination")} onPress={onSecondary} variant="ghost" full testID="areyousafe-secondary" />
        ) : null}
        <Button3D label={i18n.t("areYouSafe.danger")} onPress={onDanger} variant="danger" full testID="areyousafe-danger" />
      </View>
    </View>
  );
}

// Bucket-relative object path for a challenge selfie. The selfies_owner_insert
// policy (0019) requires the FIRST folder to be the uploading user id.
export const challengeSelfiePath = (ownerId: string, journeyId: string, ts = Date.now()) => `${ownerId}/challenge-${journeyId}-${ts}.jpg`;

// Best-effort front-camera selfie at 0 s and 3 s. Guarded end to end: a missing
// camera, storage, or journey id never blocks or crashes the challenge UI.
function ChallengeSelfie() {
  const ref = useRef<CameraView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const shoot = async () => {
      try {
        const cam = ref.current;
        if (!cam?.takePictureAsync) return;
        const j = useJourney.getState().journey as { id?: string; owner_id?: string } | null;
        const jid = j?.id;
        const owner = j?.owner_id;
        if (!jid || !owner) return;
        const pic = await cam.takePictureAsync({ quality: 0.4, base64: true, skipProcessing: true });
        if (cancelled || !pic?.base64) return;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { supabase } = require("../lib/supabase");
        const bytes = Uint8Array.from(atob(pic.base64), (c) => c.charCodeAt(0));
        // Bucket-relative path; the selfies_owner_insert policy (0019) requires the
        // FIRST folder to be the uploading user id, not the journey id.
        const path = challengeSelfiePath(owner, jid);
        await supabase.storage.from("selfies").upload(path, bytes, { contentType: "image/jpeg" });
        await events.log("challenge_selfie", { path }, jid);
      } catch (e) {
        console.warn("[modal] challenge selfie failed", (e as Error)?.message);
      }
    };
    const t0 = setTimeout(shoot, 0);
    const t3 = setTimeout(shoot, 3000);
    return () => {
      cancelled = true;
      clearTimeout(t0);
      clearTimeout(t3);
    };
  }, []);

  return (
    <CameraView
      ref={(r) => {
        ref.current = r;
      }}
      facing="front"
      testID="challenge-selfie-cam"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 1, height: 1, opacity: 0.01, position: "absolute" }}
    />
  );
}
