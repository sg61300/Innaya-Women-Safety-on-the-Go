import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../../src/theme";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Field } from "../../src/components/Field";
import { Button3D } from "../../src/components/Button3D";
import { BrandLockup } from "../../src/components/BrandLockup";
import { AuthToggle } from "../../src/components/AuthToggle";
import { TextLink } from "../../src/components/TextLink";
import { DisclaimerModal } from "../../src/components/DisclaimerModal";
import { MailGlyph } from "../../src/components/Glyphs";
import { LockAppIcon, PhoneAppIcon } from "../../src/components/AppIcon";
import { supabase } from "../../src/lib/supabase";
import { signupSchema } from "../../src/lib/authForms";
import i18n from "../../src/i18n";

type Form = { email: string; phone: string; password: string; confirm: string };

export default function Signup() {
  const [f, setF] = useState<Form>({ email: "", phone: "", password: "", confirm: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [disclaimer, setDisclaimer] = useState(false);
  const { p } = useTheme();
  const parsed = signupSchema.safeParse(f);
  const set = (k: keyof Form) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  // Show a field's first validation issue only once the user has typed into it.
  const issue = (path: keyof Form): string | null => {
    if (parsed.success || !f[path]) return null;
    return parsed.error.issues.find((i) => i.path[0] === path)?.message ?? null;
  };

  async function submit() {
    if (!parsed.success || busy) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.auth.signUp({ email: f.email, password: f.password, options: { data: { phone: f.phone } } });
    setBusy(false);
    if (error) {
      setErr(error.message.includes("registered") ? i18n.t("signup.emailUsed") : error.message);
      return;
    }
    // F5: for an already-registered email Supabase returns success with a user whose
    // `identities` array is empty and sends NO OTP (anti-enumeration). Detect that and
    // show the same "email already used" message instead of stranding the user on an
    // OTP screen waiting for a code that never arrives.
    if (data?.user && (data.user.identities?.length ?? 0) === 0) {
      setErr(i18n.t("signup.emailUsed"));
      return;
    }
    router.push({ pathname: "/(auth)/otp", params: { email: f.email, type: "signup" } });
  }

  return (
    <Screen
      scroll
      padded
      header={
        <View style={{ paddingTop: 24, paddingBottom: 8 }}>
          <BrandLockup />
        </View>
      }
    >
      <AuthToggle active="signup" />
      <Text variant="title" style={{ marginBottom: 16 }}>{i18n.t("signup.title")}</Text>

      <Field testID="signup-email" label={i18n.t("signup.email")} value={f.email} onChangeText={set("email")} icon={MailGlyph} placeholder={i18n.t("signup.emailPlaceholder")} keyboardType="email-address" error={issue("email")} />
      <Field testID="signup-phone" label={i18n.t("signup.phone")} value={f.phone} onChangeText={set("phone")} icon={PhoneAppIcon} placeholder={i18n.t("signup.phonePlaceholder")} keyboardType="phone-pad" maxLength={10} error={issue("phone")} />
      <Field testID="signup-password" label={i18n.t("signup.password")} value={f.password} onChangeText={set("password")} icon={LockAppIcon} placeholder={i18n.t("signup.passwordPlaceholder")} secure error={issue("password")} />
      <Field testID="signup-confirm" label={i18n.t("signup.confirm")} value={f.confirm} onChangeText={set("confirm")} icon={LockAppIcon} placeholder={i18n.t("signup.confirmPlaceholder")} secure error={issue("confirm")} />

      {err ? (
        <Text variant="caption" color={p.stateDanger} style={{ marginBottom: 8 }}>{err}</Text>
      ) : null}

      <View style={{ marginTop: 8 }}>
        <Button3D testID="signup-submit" label={i18n.t("signup.submit")} onPress={submit} disabled={!parsed.success} loading={busy} full />
      </View>

      {/* F10: the disclaimer is a button that opens the full text in a pop-up. */}
      <View style={{ alignItems: "center", marginTop: 16 }}>
        <TextLink testID="signup-disclaimer" label={i18n.t("consent.readFull")} onPress={() => setDisclaimer(true)} />
      </View>
      <DisclaimerModal visible={disclaimer} onClose={() => setDisclaimer(false)} />

      <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 20 }}>
        <Text variant="body" color="muted">{i18n.t("signup.haveAccount")}</Text>
        <TextLink testID="signup-to-login" label={i18n.t("signup.loginLink")} onPress={() => router.replace("/(auth)/login")} />
      </View>
    </Screen>
  );
}
