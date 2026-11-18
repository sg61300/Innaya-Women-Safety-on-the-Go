// Task 32, Card 2 — "Feel unsafe? Go live with your fans." A convincing but
// fake public live stream: a real front-camera preview, a LIVE badge, a drifting
// viewer count and scrolling fan comments. It looks like an ordinary social
// broadcast to anyone watching over the user's shoulder, while under the hood it
// tells the runner the user is in distress (SCORE 1 → guardians told).
//
// Amendment (Tasks/04, row 32): the ONLY way out is the safe word — there is no
// plain End button. The typed credential is verified against the configured
// emergency-password hash before the simulation can be closed.
import { useEffect, useRef, useState } from "react";
import { View, TextInput, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { Button3D } from "./Button3D";
import { runner } from "../services/protocolRunner";
import { gates } from "../services/gates";
import { resolveAccountEmail } from "../services/appPassword";
import i18n from "../i18n";

// A fixed 20-line pool of plausible fan chatter. Flavour only, not UI chrome.
const COMMENTS = [
  "hey! 👋", "looking good today", "where are you rn?", "love the energy ✨",
  "first!!", "hi from Mumbai", "😍😍", "turn up the volume", "you're glowing",
  "how's your day going", "🔥🔥🔥", "say hi to me pls", "new here, love it",
  "what's the plan tonight", "gorgeous 💜", "we can't hear you", "so cool",
  "waving back 👋", "stay safe out there", "❤️ from Delhi",
];
const VIEW_MIN = 120;
const VIEW_MAX = 900;
const rand = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const clamp = (n: number) => Math.max(VIEW_MIN, Math.min(VIEW_MAX, n));

export function FakeLiveStream({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { d } = useTheme();
  const insets = useSafeAreaInsets();
  // F7 (b16): the preview was a black frame because camera permission was never
  // requested here. Ask on open; the CameraView renders only once granted, and
  // the black background stays as the graceful fallback when it is denied.
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [viewers, setViewers] = useState(() => rand(VIEW_MIN, VIEW_MAX));
  const [tick, setTick] = useState(0); // advances the visible comment window
  const [word, setWord] = useState("");
  const [error, setError] = useState(false);
  const sentScore = useRef(false);

  // On open: tell the runner (real, not practice) so guardians are alerted.
  useEffect(() => {
    if (!visible) {
      sentScore.current = false;
      setWord("");
      setError(false);
      return;
    }
    if (!sentScore.current) {
      sentScore.current = true;
      void runner.send({ type: "SCORE", score: 1, reasons: ["user_distress_face"] });
    }
    const v = setInterval(() => setViewers((n) => clamp(n + rand(-40, 40))), 2000);
    const c = setInterval(() => setTick((t) => t + 1), 1600);
    return () => {
      clearInterval(v);
      clearInterval(c);
    };
  }, [visible]);

  // F7: ask for the front camera the moment the fake stream opens (fires again if
  // the hook resolves after open); a denial leaves the black-frame fallback.
  useEffect(() => {
    if (visible && camPerm && !camPerm.granted && camPerm.canAskAgain) void requestCamPerm();
  }, [visible, camPerm, requestCamPerm]);

  // ADR-043 rule 10: the emergency password is retired. The simulation exit now
  // uses the APP password (the same gates.verifyPassword path as the cancel flow
  // and the profile gate), verified against the local SecureStore hash with a
  // live sign-in fallback.
  async function tryExit() {
    const email = await resolveAccountEmail();
    const r = await gates.verifyPassword(email, word);
    if (!r.ok) {
      setError(true);
      return;
    }
    onClose();
  }

  // Three rolling comments so the feed appears to scroll without a list library.
  const visibleComments = [0, 1, 2].map((o) => COMMENTS[(tick + o) % COMMENTS.length]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => {}} transparent={false}>
      <View testID="fakelive" style={{ flex: 1, backgroundColor: "#000" }}>
        {camPerm?.granted ? (
          <CameraView facing="front" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} testID="fakelive-camera" />
        ) : null}

        {/* top row: LIVE + viewers */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 16, paddingTop: 48 }}>
          <View testID="fakelive-live-badge" style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: d.sos, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#fff" }} />
            <Text variant="chip" color="#fff">{i18n.t("simulate.live.badge")}</Text>
          </View>
          <View style={{ backgroundColor: "rgba(0,0,0,0.45)", paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 }}>
            <Text testID="fakelive-viewers" variant="chip" color="#fff">{i18n.t("simulate.live.viewers", { count: viewers })}</Text>
          </View>
        </View>

        <View style={{ flex: 1 }} />

        {/* scrolling comments */}
        <View style={{ paddingHorizontal: 16, gap: 6, marginBottom: 12 }}>
          {visibleComments.map((cmt, i) => (
            <Text key={i} testID={`fakelive-comment-${i}`} variant="caption" color="#fff" style={{ textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 3 }}>
              {cmt}
            </Text>
          ))}
        </View>

        {/* safe-word exit gate — the only way out. F13 (b16): keep the input and
            the exit button above the Android nav bar (safe-area inset) and above
            the keyboard (KeyboardAvoidingView) so they are never clipped. */}
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={{ padding: 16, paddingBottom: Math.max(insets.bottom, 16) + 16, gap: 8, backgroundColor: "rgba(0,0,0,0.55)" }}>
            <Text variant="caption" color="#fff">{i18n.t("simulate.live.exitHint")}</Text>
            <TextInput
              testID="fakelive-exit-input"
              value={word}
              onChangeText={(t) => { setWord(t); setError(false); }}
              placeholder={i18n.t("simulate.live.exitPlaceholder")}
              placeholderTextColor="rgba(255,255,255,0.5)"
              accessibilityLabel={i18n.t("simulate.live.exitPlaceholder")}
              autoCapitalize="none"
              secureTextEntry
              style={{ minHeight: 48, borderRadius: 12, paddingHorizontal: 14, color: "#fff", backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: error ? d.sos : "rgba(255,255,255,0.25)" }}
            />
            {error ? <Text testID="fakelive-exit-error" variant="caption" color={d.sos}>{i18n.t("simulate.live.exitWrong")}</Text> : null}
            <Button3D variant="ghost" label={i18n.t("simulate.live.exit")} onPress={() => void tryExit()} testID="fakelive-exit-btn" />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
