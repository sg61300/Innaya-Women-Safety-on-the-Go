import { useEffect, useRef, useState } from "react";
import { View, TextInput, Keyboard } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTheme } from "../../src/theme";
import { TYPE } from "../../src/theme/typography";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Button3D } from "../../src/components/Button3D";
import { TextLink } from "../../src/components/TextLink";
import { supabase } from "../../src/lib/supabase";
import { events } from "../../src/lib/events";
import { useSession } from "../../src/store/session";
import i18n from "../../src/i18n";

type OtpType = "signup" | "recovery";
const RESEND_SECONDS = 30;

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

export default function Otp() {
  const params = useLocalSearchParams<{ email?: string; type?: string }>();
  const email = first(params.email);
  const type = (first(params.type) === "recovery" ? "recovery" : "signup") as OtpType;

  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(RESEND_SECONDS);
  const submitted = useRef(false);
  const { p, d } = useTheme();

  // Resend cooldown countdown.
  useEffect(() => {
    if (left <= 0) return;
    const id = setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [left]);

  // Auto-submit once six digits are entered (guard against a double fire).
  useEffect(() => {
    if (code.length === 6 && !submitted.current) {
      submitted.current = true;
      verify(code);
    }
    if (code.length < 6) submitted.current = false;
  }, [code]);

  async function onVerified() {
    // signup_completed: the sign-up funnel is done the moment the OTP verifies.
    // Recovery (password reset) is not a sign-up, so it is not counted.
    if (type === "signup") {
      void events.log("signup_completed", {});
      await events.flush();
    }
    // D8: dismiss the OTP soft keyboard before navigating so it does not stay up
    // on the next screen (the permissions screen was left with the keyboard open).
    Keyboard.dismiss();
    if (type === "recovery") router.replace({ pathname: "/(auth)/reset", params: { stage: "new" } });
    else router.replace("/(setup)/permissions");
  }

  async function verify(token: string) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    // R22 dev-only E2E bypass: with EXPO_PUBLIC_E2E=1, code 000000 confirms the
    // user via a dev-only RPC. If the RPC is missing at runtime it must fail
    // loudly — never silently pass.
    if (__DEV__ && process.env.EXPO_PUBLIC_E2E === "1" && token === "000000") {
      const { error } = await supabase.rpc("e2e_confirm", { email });
      setBusy(false);
      if (error) {
        console.error("[otp] e2e_confirm missing", error.message);
        return setErr(i18n.t("otp.e2eMissing"));
      }
      return onVerified();
    }
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type });
    setBusy(false);
    if (error) {
      setErr(i18n.t("otp.invalid"));
      setCode("");
      return;
    }
    // Seed the session user id now so signup_completed (and any following events)
    // carry the user before the app's auth listener has caught up.
    const uid = data?.user?.id ?? data?.session?.user?.id ?? null;
    if (uid) useSession.getState().set({ userId: uid });
    await onVerified();
  }

  async function resend() {
    if (left > 0) return;
    setLeft(RESEND_SECONDS);
    setErr(null);
    // D3 (s09): a recovery code is re-sent via the password-reset flow; only a
    // signup code goes through auth.resend({type:"signup"}).
    // F7 (founder live test): the resend result was previously discarded, so a
    // rate-limited or failed resend was invisible and read as "OTP did not come".
    // Surface the failure and re-enable the button so she can retry once cleared.
    const { error } =
      type === "recovery"
        ? await supabase.auth.resetPasswordForEmail(email)
        : await supabase.auth.resend({ type: "signup", email });
    if (error) {
      setErr(i18n.t("otp.resendFailed"));
      setLeft(0);
    }
  }

  return (
    <Screen scroll padded>
      <View style={{ paddingTop: 48 }}>
        <Text variant="title" style={{ marginBottom: 8 }}>{i18n.t("otp.title")}</Text>
        <Text variant="body" color="muted" style={{ marginBottom: 24 }}>{i18n.t("otp.sub", { email })}</Text>

        <TextInput
          testID="otp-input"
          accessibilityLabel={i18n.t("otp.input")}
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          maxLength={6}
          autoFocus
          style={{
            minHeight: 64,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: err ? p.stateDanger : d.input.border,
            backgroundColor: d.input.bg,
            color: p.text,
            textAlign: "center",
            letterSpacing: 12,
            fontFamily: TYPE.title.fontFamily,
            fontSize: TYPE.title.fontSize,
          }}
        />

        {busy ? <Text variant="caption" color="muted" style={{ marginTop: 10 }}>{i18n.t("otp.verifying")}</Text> : null}
        {err ? <Text variant="caption" color={p.stateDanger} style={{ marginTop: 10 }}>{err}</Text> : null}

        <View style={{ marginTop: 28, gap: 8, alignItems: "flex-start" }}>
          <Button3D
            testID="otp-resend"
            variant="ghost"
            label={left > 0 ? i18n.t("otp.resendIn", { seconds: left }) : i18n.t("otp.resend")}
            onPress={resend}
            disabled={left > 0}
          />
          <TextLink testID="otp-change-email" label={i18n.t("otp.changeEmail")} onPress={() => router.back()} style={{ marginTop: 8 }} />
        </View>
      </View>
    </Screen>
  );
}
