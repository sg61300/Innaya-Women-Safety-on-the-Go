import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../../src/theme";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Field } from "../../src/components/Field";
import { Button3D } from "../../src/components/Button3D";
import { Card } from "../../src/components/Card";
import { BrandLockup } from "../../src/components/BrandLockup";
import { AuthToggle } from "../../src/components/AuthToggle";
import { TextLink } from "../../src/components/TextLink";
import { MailGlyph, GoogleGlyph } from "../../src/components/Glyphs";
import { LockAppIcon } from "../../src/components/AppIcon";
import { supabase } from "../../src/lib/supabase";
import { detectIdentifier } from "../../src/lib/authForms";
import { storeAppPasswordHash, storeAccountEmail } from "../../src/services/appPassword";
import i18n from "../../src/i18n";

// Google OAuth is wired but hidden until the provider is configured in Supabase
// (Task 17 note, Day 3). Flip to true once the console has the client id.
const GOOGLE_ENABLED = false;

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { p } = useTheme();
  const canSubmit = identifier.trim().length > 0 && password.length > 0;

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setErr(null);
    const email = identifier.trim();
    // D1 (s09 security): server-side phone login is a Day 3+ task. email_for_phone
    // is SECURITY DEFINER and its EXECUTE is revoked from the client roles in
    // migration 0009, so the phone path never calls the RPC — ask for the email.
    if (detectIdentifier(email).kind === "phone") {
      setBusy(false);
      return setErr(i18n.t("login.useEmail"));
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      return setErr(i18n.t("login.invalid"));
    }
    // R50: store the salted hash of the app password so the CRITICAL cancel gate can
    // verify it offline (never the plaintext). A keystore failure must not block
    // login — the gate falls back to a live sign-in when no local hash exists.
    try {
      await storeAppPasswordHash(password);
    } catch (e) {
      console.warn("[login] app-password hash store failed", (e as Error)?.message);
    }
    // J4: cache the email so the CRITICAL gate can still attempt the live sign-in
    // fallback offline, when supabase.auth.getUser() cannot reach the server.
    await storeAccountEmail(email);
    setBusy(false);
    // Session now exists; the root route re-runs decideRoute for the next step.
    router.replace("/");
  }

  async function google() {
    await supabase.auth.signInWithOAuth({ provider: "google" });
  }

  return (
    <Screen
      scroll
      padded
      header={
        // X3 (s25): the brand lockup stays fixed at the top while the form scrolls.
        <View style={{ paddingTop: 24, paddingBottom: 8 }}>
          <BrandLockup />
        </View>
      }
    >
      <AuthToggle active="login" />

      <Field
        testID="login-identifier"
        label={i18n.t("login.identifier")}
        value={identifier}
        onChangeText={setIdentifier}
        icon={MailGlyph}
        placeholder={i18n.t("login.identifierPlaceholder")}
      />
      <Field testID="login-password" label={i18n.t("login.password")} value={password} onChangeText={setPassword} icon={LockAppIcon} placeholder={i18n.t("login.passwordPlaceholder")} secure onSubmitEditing={submit} />

      {err ? <Text variant="caption" color={p.stateDanger} style={{ marginBottom: 8 }}>{err}</Text> : null}

      <TextLink
        testID="login-forgot"
        label={i18n.t("login.forgot")}
        onPress={() => router.push("/(auth)/reset")}
        underline={false}
        style={{ alignSelf: "flex-end", marginBottom: 16 }}
      />

      <Button3D testID="login-submit" label={i18n.t("login.submit")} onPress={submit} disabled={!canSubmit} loading={busy} full />

      {GOOGLE_ENABLED ? (
        <View style={{ marginTop: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: p.border }} />
            <Text variant="caption" color="muted">{i18n.t("auth.orContinue")}</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: p.border }} />
          </View>
          <Card testID="login-google" onPress={google}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <GoogleGlyph size={20} color={p.text} />
              <Text variant="bodyStrong">{i18n.t("auth.google")}</Text>
            </View>
          </Card>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 24 }}>
        <Text variant="body" color="muted">{i18n.t("login.noAccount")}</Text>
        <TextLink testID="login-to-signup" label={i18n.t("login.signupLink")} onPress={() => router.replace("/(auth)/signup")} />
      </View>
    </Screen>
  );
}
