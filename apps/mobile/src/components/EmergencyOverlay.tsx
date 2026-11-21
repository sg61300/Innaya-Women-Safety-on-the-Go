import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { Modal, View, TextInput, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SOS_SIREN_DELAY_MS } from "@vaira/core";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { EmergencyLayout } from "./EmergencyLayout";
import { CountdownRing } from "./CountdownRing";
import { CancelFlow } from "./CancelFlow";
import { makeCancelFlowDeps } from "../services/cancelFlowDeps";
import { makeSimulationCancelFlowDeps } from "../services/simulationCancelFlowDeps";
import { resolveAccountEmail } from "../services/appPassword";
import type { ActionLogItem } from "./ActionLog";
import { useJourney } from "../store/journey";
import { runner } from "../services/protocolRunner";
import { TYPE } from "../theme/typography";
import i18n from "../i18n";

// ADR-043 — the full-screen alarm surface. It covers every user screen while the
// runner is in EMERGENCY (score escalation) or a SIREN-mode CRITICAL/CANCEL_HOLD.
// SILENT-mode CRITICAL/CANCEL_HOLD shows the calm SilentAlarmScreen (mounted in
// (user)/_layout) instead — this overlay stays hidden: no red, no siren.
//   EMERGENCY  → the are-you-safe safe-word step (unchanged de-escalation).
//   CRITICAL   → 10 s siren countdown (the runner owns the siren) + one "Not an
//                emergency" button that opens the guardian-approved CancelFlow.
// The overlay owns NO protocol state or siren; it reads the state and renders.
const SIREN_SEC = Math.round(SOS_SIREN_DELAY_MS / 1000);

export function EmergencyOverlay() {
  const rawState = useJourney((s) => s.ctx.state);
  const alarmMode = useJourney((s) => s.ctx.alarmMode);
  const journeyId = useJourney((s) => (s.journey?.id as string | undefined) ?? undefined);
  // While an are-you-safe challenge is open the challenge modal owns the screen.
  const challengeOpen = useJourney((s) => s.challenge !== null);
  const isSiren = alarmMode === "siren";
  const isCritical = rawState === "CRITICAL" || rawState === "CANCEL_HOLD";
  // Fix AD round 2: while a guardian cancel is waiting her screen stays normal.
  const cancelWaiting = useJourney((s) => !!s.ctx.cancelWaiting || !!s.ctx.quietAlarm);
  const visible = !challengeOpen && !cancelWaiting && (rawState === "EMERGENCY" || (isCritical && isSiren));
  const state = (visible ? rawState : "EMERGENCY") as "EMERGENCY" | "CRITICAL" | "CANCEL_HOLD";

  const [safewordOpen, setSafewordOpen] = useState(false); // EMERGENCY de-escalation
  const [cancelOpen, setCancelOpen] = useState(false); // CRITICAL guardian cancel flow
  const [field, setField] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // Reset the flow whenever the protocol state changes.
  useEffect(() => {
    setSafewordOpen(false);
    setCancelOpen(false);
    setField("");
    setMsg(null);
    setAccepted(false);
    setBusy(false);
    busyRef.current = false;
  }, [rawState, cancelWaiting]);

  // X5a: a practice drill routes the cancel/proof flow to the SIMULATION deps
  // (self-email, no guardian) instead of the real guardian deps.
  const practice = runner.isPractice();

  // One deps instance per journey (binds the live password gate, cancel-request
  // API, realtime verdict and media upload to the pure CancelFlow machine). In a
  // practice drill it binds the simulation deps instead.
  const deps = useMemo(() => (practice ? makeSimulationCancelFlowDeps() : makeCancelFlowDeps()), [journeyId, practice]);

  // X5a: the tester's own account email, shown in the sim notice and success line.
  const [simEmail, setSimEmail] = useState("");
  useEffect(() => {
    if (!practice) { setSimEmail(""); return; }
    let alive = true;
    void resolveAccountEmail().then((e) => { if (alive) setSimEmail(e); }).catch(() => {});
    return () => { alive = false; };
  }, [practice]);

  // The layout's single footer control ("Not an emergency").
  const onCancelPress = useCallback(() => {
    if (state === "EMERGENCY") {
      setField("");
      setMsg(null);
      setSafewordOpen(true);
      return;
    }
    // SIREN-mode CRITICAL/CANCEL_HOLD: hold the siren and open the cancel flow.
    runner.holdSirenForCancel();
    setCancelOpen(true);
  }, [state]);

  async function submitSafeword() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (await runner.resolveChallenge(field, false)) {
        setAccepted(true);
        setMsg(null);
      } else {
        setMsg(i18n.t("emergency.notRecognised"));
        setField("");
      }
    } catch {
      setMsg(i18n.t("emergency.notRecognised"));
      setField("");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const guardiansPending = useJourney((s) => s.guardiansPending);
  const sirenStatus = useJourney((s) => s.sirenStatus);
  // In a practice drill nothing is actually sent (practice suppresses location,
  // siren, guardian calls), so the checklist uses "would be" copy; filled
  // ticks per founder ruling 2026-10-13 (s33). Real mode
  // (practice === false) is unchanged, byte for byte.
  const items: ActionLogItem[] = useMemo(() => practice ? [
    { label: i18n.t("emergency.logGuardiansPractice"), done: true },
    { label: i18n.t("emergency.logLocationPractice"), done: true },
    { label: i18n.t("emergency.logNearbyPractice"), done: true },
    { label: i18n.t("emergency.logLiveFeedPractice"), done: true },
    { label: i18n.t("emergency.logSirenPractice"), done: true },
  ] : [
    guardiansPending
      ? { label: i18n.t("emergency.logGuardiansPending"), done: false }
      : { label: i18n.t("emergency.logGuardians"), done: true },
    { label: i18n.t("emergency.logLocation"), done: true },
    { label: i18n.t("emergency.logNearby"), done: state === "CRITICAL" || state === "CANCEL_HOLD" },
    { label: i18n.t("emergency.logLiveFeed"), done: state === "EMERGENCY" || state === "CRITICAL" || state === "CANCEL_HOLD" },
    { label: i18n.t("emergency.logSiren"), done: (state === "CRITICAL" || state === "EMERGENCY") && sirenStatus !== "error" },
  ], [state, guardiansPending, sirenStatus, practice]);

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
      testID="emergency-overlay"
    >
      {cancelOpen ? (
        <CancelFlow
          hasJourney={!!journeyId}
          deps={deps}
          onSirenResume={isSiren ? () => runner.resumeSirenAfterCancel() : undefined}
          onExit={() => { setCancelOpen(false); if (isSiren) runner.resumeSirenAfterCancel(); }}
          simulation={practice ? { email: simEmail } : null}
        />
      ) : (
        <TickingLayout rawState={rawState} state={state} items={items} onCancelPress={onCancelPress} sirenRing={isCritical && isSiren} practice={practice} />
      )}

      {safewordOpen && !cancelOpen ? (
        <SafewordPanel
          field={field}
          onField={setField}
          msg={msg}
          accepted={accepted}
          busy={busy}
          onSubmit={submitSafeword}
          onBack={() => { setSafewordOpen(false); setField(""); setMsg(null); }}
        />
      ) : null}
    </Modal>
  );
}

// G4/H3: the 1 s tick lives in this leaf so a keystroke/tick never re-renders the
// heavy layout. For a SIREN-mode CRITICAL it also drives the visual 10 s ring
// (VISUAL ONLY — the runner fires the siren at SOS_SIREN_DELAY_MS).
const TickingLayout = memo(function TickingLayout({
  rawState,
  state,
  items,
  onCancelPress,
  sirenRing,
  practice,
}: {
  rawState: string;
  state: "EMERGENCY" | "CRITICAL" | "CANCEL_HOLD";
  items: ActionLogItem[];
  onCancelPress: () => void;
  sirenRing?: boolean;
  practice?: boolean;
}) {
  const [elapsedS, setElapsedS] = useState(0);
  const baseRef = useRef(Date.now());
  useEffect(() => {
    baseRef.current = Date.now();
    setElapsedS(0);
    const id = setInterval(() => setElapsedS(Math.floor((Date.now() - baseRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [rawState]);

  return (
    <EmergencyLayout state={state} elapsedS={elapsedS} items={items} onCancelPress={onCancelPress} practice={practice}>
      {sirenRing ? (
        <View testID="siren-countdown" style={{ alignItems: "center" }}>
          <CountdownRing seconds={Math.max(0, SIREN_SEC - elapsedS)} total={SIREN_SEC} />
        </View>
      ) : undefined}
    </EmergencyLayout>
  );
});

function SafewordPanel({
  field,
  onField,
  msg,
  accepted,
  busy,
  onSubmit,
  onBack,
}: {
  field: string;
  onField: (v: string) => void;
  msg: string | null;
  accepted: boolean;
  busy: boolean;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const { p, d } = useTheme();
  return (
    <KeyboardAvoidingView
      testID="overlay-flow-kav"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 0, justifyContent: "flex-end" }}
    >
      <View testID="overlay-flow" style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" }}>
        <View style={{ backgroundColor: p.bgCard, padding: 24, paddingBottom: 40, gap: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <Pressable
            testID="overlay-flow-back"
            accessibilityRole="button"
            accessibilityLabel={i18n.t("emergency.back")}
            onPress={onBack}
            hitSlop={12}
            style={{ minHeight: 48, justifyContent: "center", alignSelf: "flex-start" }}
          >
            <Text variant="bodyStrong" color="muted">{i18n.t("emergency.back")}</Text>
          </Pressable>
          {accepted ? (
            <Text variant="bodyStrong" color={p.text} testID="overlay-accepted">{i18n.t("emergency.safeWordAccepted")}</Text>
          ) : (
            <>
              <Text variant="bodyStrong" color={p.text}>{i18n.t("emergency.safeWordLabel")}</Text>
              <TextInput
                testID="overlay-safeword"
                accessibilityLabel={i18n.t("emergency.safeWordLabel")}
                value={field}
                onChangeText={onField}
                secureTextEntry
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={busy ? undefined : onSubmit}
                placeholderTextColor={d.input.placeholder}
                style={{ minHeight: 52, paddingHorizontal: 16, borderRadius: 14, backgroundColor: d.input.bg, borderWidth: 1, borderColor: d.input.border, fontFamily: TYPE.body.fontFamily, fontSize: TYPE.body.fontSize, color: p.text }}
              />
              {msg ? <Text variant="body" color={d.sos} testID="overlay-msg">{msg}</Text> : null}
              <Pressable
                testID="overlay-submit"
                accessibilityRole="button"
                accessibilityLabel={i18n.t("emergency.submit")}
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={onSubmit}
                hitSlop={8}
                style={({ pressed }) => ({ minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: d.sos, opacity: busy ? 0.4 : pressed ? 0.7 : 1 })}
              >
                <Text variant="bodyStrong" color="onPrimary">{i18n.t("emergency.submit")}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
