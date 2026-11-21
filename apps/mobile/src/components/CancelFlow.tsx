import { useEffect, useRef, useState } from "react";
import { View, TextInput, Pressable } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { Button3D } from "./Button3D";
import { TYPE } from "../theme/typography";
import i18n from "../i18n";
import { CANCEL_PASSWORD_LOCK_MS, type CancelMethod } from "@vaira/core";
import { CancelMediaCapture, type MediaCapture } from "./CancelMediaCapture";

// ADR-043 item 4 — the "Not an emergency" cancel flow, shared by Siren and Silent
// modes. It is a pure, dependency-injected state machine so every step and every
// failure path is unit-testable without native modules or Supabase. The siren
// (held during the flow, resumed on a step-1 failure in Siren mode) is driven by the runner/alarmMode, NOT here — this component owns
// only the wearer's screens and the cancel request.
//
// Steps (§1 rules 5–9): 1 app password (2 tries, 30 s lock) → 2 journey word
// ("Forgot it" → step 4) → 3 guardian request → (4 photo/video proof). Once the
// request is open the flow is done: her screen goes normal (Fix AD round 2).
// No active journey → step 2 is skipped and the wearer goes straight to step 4.

// X5c (s25): the gate can fail for two very different reasons — a genuinely wrong
// password vs. a network/service failure it could not check. Collapsing both to a
// bare `false` counted a connectivity blip as a wrong try and could trip the 30 s
// lock ("I don't think the password was accepted"). verifyPassword may now return
// the reason; a plain boolean is still accepted (true = ok, false = wrong).
export type PasswordOutcome = boolean | { ok: boolean; reason?: "wrong" | "network" };

export type CancelFlowDeps = {
  verifyPassword: (pw: string) => Promise<PasswordOutcome>;
  verifyWord: (w: string) => Promise<boolean>;
  // Opens the guardian cancel request; resolves with how many guardians were asked.
  createRequest: (method: CancelMethod, mediaPath?: string) => Promise<{ askedCount: number }>;
  // Uploads the proof to the private selfies bucket; resolves with the object path.
  // Throws on failure so the request is never created without its media.
  uploadMedia?: (localUri: string, method: "photo" | "video") => Promise<string>;
  // Native photo/video capture (injected in tests; defaults to the live camera).
  captureMedia?: MediaCapture;
};

type Step = "password" | "word" | "media" | "requested" | "sent";

export function CancelFlow({
  hasJourney,
  deps,
  onSirenResume,
  onExit,
  simulation,
}: {
  hasJourney: boolean;
  deps: CancelFlowDeps;
  // ADR-043 rule 5: the 2nd wrong app password in Siren mode restarts the siren
  // (the runner owns it). Undefined in Silent mode — nothing to resume.
  onSirenResume?: () => void;
  // X5b (s25): a visible way OUT of the cancel flow that returns to the alarm
  // state (the request stays open, siren per ADR-043). Rendered on every
  // interactive step so the proof screen is never a dead end. Undefined = no exit.
  onExit?: () => void;
  // X5a (s25): a practice drill. When set, the media step shows a notice that the
  // proof is emailed to the tester's OWN address (`email`), the proof goes through
  // the simulation deps (self-email, NO guardian), and success lands on the "sent"
  // screen instead of the guardian-verdict wait. Null/undefined = the real flow.
  simulation?: { email: string } | null;
}) {
  const { p, d } = useTheme();
  const [step, setStep] = useState<Step>("password");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pwFails, setPwFails] = useState(0);
  const [lockLeft, setLockLeft] = useState(0); // seconds remaining on the 30 s lock
  const [sentTo, setSentTo] = useState(""); // X5a: the address the sim proof went to

  // 30 s password lock countdown (rule 5: a third attempt only after 30 s).
  useEffect(() => {
    if (lockLeft <= 0) return;
    const id = setInterval(() => setLockLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [lockLeft]);

  const reset = () => {
    setValue("");
    setError(null);
  };

  const submitPassword = async () => {
    if (busy || lockLeft > 0) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await deps.verifyPassword(value);
      const ok = typeof outcome === "boolean" ? outcome : outcome.ok;
      const reason = typeof outcome === "boolean" ? (outcome ? undefined : "wrong") : outcome.reason ?? (outcome.ok ? undefined : "wrong");
      if (ok) {
        reset();
        setStep(hasJourney ? "word" : "media"); // no journey → straight to proof (rule 6)
        return;
      }
      // X5c: a network/service failure is NOT a wrong password — do not spend a try
      // or start the lock; tell the wearer to retry.
      if (reason === "network") {
        setError(i18n.t("cancelFlow.pwNetwork"));
        setValue("");
        return;
      }
      const fails = pwFails + 1;
      setPwFails(fails);
      if (fails >= 2) {
        setLockLeft(Math.round(CANCEL_PASSWORD_LOCK_MS / 1000)); // 2nd failure → 30 s lock
        onSirenResume?.(); // rule 5: the siren starts/stays on after the 2nd wrong try
        setError(i18n.t("cancelFlow.pwLocked", { n: Math.round(CANCEL_PASSWORD_LOCK_MS / 1000) }));
      } else {
        setError(i18n.t("cancelFlow.pwWrong", { n: 2 - fails }));
      }
      setValue("");
    } finally {
      setBusy(false);
    }
  };

  const submitWord = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!(await deps.verifyWord(value))) {
        setError(i18n.t("cancelFlow.wordWrong"));
        return;
      }
      reset();
      await deps.createRequest("word");
      setStep("requested");
    } catch (e) {
      // 409 = the alarm left a cancellable state before the request landed; any other
      // failure keeps her on this step to retry. The word was right, so never say wrong.
      setError(i18n.t((e as Error)?.name === "NotCancellableError" ? "cancelFlow.notActive" : "cancelFlow.sendFailed"));
    } finally {
      setBusy(false);
    }
  };

  const onCaptured = async (localUri: string, method: "photo" | "video") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // X5a: a practice drill emails the proof to the tester's OWN address through
      // the simulation deps (uploadMedia = POST /api/simulate-proof). It NEVER opens
      // a guardian cancel request, so skip createRequest and land on the "sent"
      // screen — no guardian is ever contacted from a simulation.
      if (simulation) {
        const to = deps.uploadMedia ? await deps.uploadMedia(localUri, method) : "";
        setSentTo(to || simulation.email);
        setStep("sent");
        return;
      }
      // Upload FIRST; only create the request once the media exists, so a failed
      // upload never leaves a medialess request behind (stress requirement).
      const mediaPath = deps.uploadMedia ? await deps.uploadMedia(localUri, method) : undefined;
      await deps.createRequest(method, mediaPath);
      setStep("requested");
    } catch (e) {
      setError(i18n.t((e as Error)?.name === "NotCancellableError" ? "cancelFlow.notActive" : "cancelFlow.uploadFailed"));
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    alignSelf: "stretch" as const,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: d.input.bg,
    borderWidth: 1,
    borderColor: d.input.border,
    fontFamily: TYPE.body.fontFamily,
    fontSize: TYPE.body.fontSize,
    color: p.text,
  };

  // X5b: a visible "Back to alarm" control returning to the alarm state. Absolutely
  // positioned top-left so it never disturbs the centered step layout.
  const exitControl =
    onExit && step !== "requested" && step !== "sent" ? (
      <Pressable
        testID="cancel-exit"
        accessibilityRole="button"
        accessibilityLabel={i18n.t("cancelFlow.backToAlarm")}
        onPress={onExit}
        hitSlop={12}
        style={{ position: "absolute", top: 12, left: 12, zIndex: 10, minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}
      >
        <Text variant="bodyStrong" color={d.sos}>{i18n.t("cancelFlow.backToAlarm")}</Text>
      </Pressable>
    ) : null;

  const frame = (children: React.ReactNode, testID: string) => (
    <View testID={testID} style={{ flex: 1, backgroundColor: p.brandSoft, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
      {exitControl}
      {children}
    </View>
  );

  if (step === "password") {
    return frame(
      <>
        <Text variant="display">{i18n.t("cancelFlow.pwTitle")}</Text>
        <Text variant="body" color={p.textMuted} style={{ textAlign: "center" }}>{i18n.t("cancelFlow.pwSub")}</Text>
        <TextInput
          testID="cancel-password-input"
          value={value}
          onChangeText={(v) => { setValue(v); setError(null); }}
          placeholder={i18n.t("cancelFlow.pwPlaceholder")}
          placeholderTextColor={d.input.placeholder}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={submitPassword}
          style={inputStyle}
        />
        {error ? <Text testID="cancel-error" variant="caption" color={d.sos}>{error}</Text> : null}
        <Button3D
          label={lockLeft > 0 ? i18n.t("cancelFlow.pwLocked", { n: lockLeft }) : i18n.t("cancelFlow.pwSubmit")}
          onPress={submitPassword}
          disabled={busy || lockLeft > 0}
          full
          testID="cancel-password-submit"
        />
      </>,
      "cancel-step-password",
    );
  }

  if (step === "word") {
    return frame(
      <>
        <Text variant="display">{i18n.t("cancelFlow.wordTitle")}</Text>
        <Text variant="body" color={p.textMuted} style={{ textAlign: "center" }}>{i18n.t("cancelFlow.wordSub")}</Text>
        <TextInput
          testID="cancel-word-input"
          value={value}
          onChangeText={(v) => { setValue(v); setError(null); }}
          placeholder={i18n.t("cancelFlow.wordPlaceholder")}
          placeholderTextColor={d.input.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={submitWord}
          style={inputStyle}
        />
        {error ? <Text testID="cancel-error" variant="caption" color={d.sos}>{error}</Text> : null}
        <View style={{ alignSelf: "stretch", gap: 12 }}>
          <Button3D label={i18n.t("cancelFlow.wordSubmit")} onPress={submitWord} disabled={busy} full testID="cancel-word-submit" />
          <Button3D label={i18n.t("cancelFlow.forgot")} onPress={() => { reset(); setStep("media"); }} variant="ghost" full testID="cancel-forgot" />
        </View>
      </>,
      "cancel-step-word",
    );
  }

  if (step === "media") {
    return (
      <View testID="cancel-step-media" style={{ flex: 1, backgroundColor: p.brandSoft }}>
        {exitControl}
        {simulation ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 8 }}>
            <Text testID="cancel-sim-notice" variant="body" color={p.text} style={{ textAlign: "center" }}>
              {i18n.t("cancelFlow.simNotice", { email: simulation.email })}
            </Text>
          </View>
        ) : null}
        <CancelMediaCapture onCaptured={onCaptured} capture={deps.captureMedia} />
        {error ? (
          <View style={{ padding: 16 }}>
            <Text testID="cancel-error" variant="caption" color={d.sos}>{error}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (step === "sent") {
    // X5a: the practice proof was emailed to the tester. The existing exit
    // affordance (onExit) ends the drill.
    return frame(
      <>
        <Text variant="display" testID="cancel-sim-sent-title">{i18n.t("cancelFlow.simSentTitle")}</Text>
        <Text variant="body" color={p.textMuted} style={{ textAlign: "center" }} testID="cancel-sim-sent">
          {i18n.t("cancelFlow.simSent", { email: sentTo })}
        </Text>
        {onExit ? <Button3D label={i18n.t("cancelFlow.simDone")} onPress={onExit} full testID="cancel-sim-done" /> : null}
      </>,
      "cancel-step-sent",
    );
  }

  // "requested": the overlay closes as the runner marks the wait; nothing to show.
  return null;
}
