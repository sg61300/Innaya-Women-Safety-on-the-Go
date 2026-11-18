import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { z } from "zod";
import { useTheme } from "../../src/theme";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Field } from "../../src/components/Field";
import { Button3D } from "../../src/components/Button3D";
import { MailGlyph } from "../../src/components/Glyphs";
import { AppIcon, LockAppIcon } from "../../src/components/AppIcon";
import { supabase } from "../../src/lib/supabase";
import { storeAppPasswordHash } from "../../src/services/appPassword";
import i18n from "../../src/i18n";

const emailOk = (s: string) => z.string().email().safeParse(s.trim()).success;
const passwordOk = (s: string) => s.length >= 8 && /\d/.test(s);

export default function Reset() {
  const params = useLocalSearchParams<{ stage?: string }>();
  const stage = (Array.isArray(params.stage) ? params.stage[0] : params.stage) === "new" ? "new" : "email";
  const { p } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    if (!emailOk(email) || busy) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (error) return setErr(error.message);
    router.push({ pathname: "/(auth)/otp", params: { email: email.trim(), type: "recovery" } });
  }

  async function saveNew() {
    if (!passwordOk(password) || busy) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      return setErr(error.message);
    }
    // F2 (safety): refresh the offline app-password hash to the NEW password, or
    // the stale hash would reject it at the CRITICAL cancel gate (G2 regression).
    // Best-effort: a keystore failure must not block the reset (gate falls back to
    // the live sign-in, which then refreshes the hash).
    try {
      await storeAppPasswordHash(password);
    } catch (e) {
      console.warn("[reset] app-password hash refresh failed", (e as Error)?.message);
    }
    setBusy(false);
    // D4 (s09): route to root so decideRoute runs (same as login.tsx), instead
    // of jumping straight into (user)/home and skipping any unfinished setup.
    router.replace("/");
  }

  if (stage === "new") {
    return (
      <Screen scroll padded>
        <View style={{ paddingTop: 48 }}>
          <Text variant="title" style={{ marginBottom: 8 }}>{i18n.t("reset.newTitle")}</Text>
          <Text variant="body" color="muted" style={{ marginBottom: 24 }}>{i18n.t("reset.newSub")}</Text>
          <Field testID="reset-password" label={i18n.t("reset.newPassword")} value={password} onChangeText={setPassword} icon={LockAppIcon} placeholder={i18n.t("reset.newPasswordPlaceholder")} secure />
          {err ? <Text variant="caption" color={p.stateDanger} style={{ marginBottom: 8 }}>{err}</Text> : null}
          <Button3D testID="reset-save" label={i18n.t("reset.updatePassword")} onPress={saveNew} disabled={!passwordOk(password)} loading={busy} full />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll padded>
      <View style={{ paddingTop: 48 }}>
        <Text variant="title" style={{ marginBottom: 8 }}>{i18n.t("reset.emailTitle")}</Text>
        <Text variant="body" color="muted" style={{ marginBottom: 24 }}>{i18n.t("reset.emailSub")}</Text>
        <Field testID="reset-email" label={i18n.t("reset.email")} value={email} onChangeText={setEmail} icon={MailGlyph} placeholder={i18n.t("reset.emailPlaceholder")} keyboardType="email-address" />
        {err ? <Text variant="caption" color={p.stateDanger} style={{ marginBottom: 8 }}>{err}</Text> : null}
        <Button3D testID="reset-send" label={i18n.t("reset.sendCode")} onPress={sendCode} disabled={!emailOk(email)} loading={busy} full />

        {/* Phone reset is not wired yet — rendered disabled per the Task 17 spec. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 24, opacity: 0.5 }}>
          <AppIcon name="call" size={20} />
          <Text variant="caption" color="muted" accessibilityState={{ disabled: true }}>{i18n.t("reset.phoneSoon")}</Text>
        </View>
      </View>
    </Screen>
  );
}
