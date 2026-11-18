import { type ReactNode, useEffect, useState } from "react";
import { View, TextInput, AppState } from "react-native";
import { Screen } from "./Screen";
import { Text } from "./Text";
import { Button3D } from "./Button3D";
import { useTheme } from "../theme";
import { TYPE } from "../theme/typography";
import { gates } from "../services/gates";
import { resolveAccountEmail } from "../services/appPassword";
import { supabase } from "../lib/supabase";
import i18n from "../i18n";

// F5/profile-cards: the app-password gate that guards the whole Profile section.
// Lifted out of the old single-file profile screen so it now wraps the nested
// profile Stack in `_layout.tsx` — every child route (Details, Guardians, a
// ?section=<name> deep link, ...) is reached only after this gate opens.
// "checking" until we know whether a local password hash exists; "locked"
// challenges with the app password (same gates.verifyPassword path as
// EmergencyOverlay); "open" renders the children. Re-locks on foreground so a
// handed-over phone re-prompts.
type GatePhase = "checking" | "locked" | "open";

export function ProfileGate({ children }: { children: ReactNode }) {
  const { p, d } = useTheme();
  const [phase, setPhase] = useState<GatePhase>("checking");
  const [field, setField] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Profile is protected on every entry. If the local hash is absent (for
    // example, an existing session created before the offline cache was added),
    // submit() falls back to the live account-password verifier and caches it on
    // success. Opening Profile must never silently bypass its password gate.
    setPhase("locked");
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") { setPhase("locked"); setField(""); setMsg(null); }
    });
    return () => sub.remove();
  }, []);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      let email = "";
      try { const { data } = await supabase.auth.getUser(); email = data?.user?.email ?? ""; } catch { /* offline: fall back to the cached email */ }
      if (!email) email = await resolveAccountEmail().catch(() => "");
      const r = await gates.verifyPassword(email, field);
      if (r.ok) { setPhase("open"); setField(""); }
      else setMsg(i18n.t(r.reason === "network" ? "profile.gateNetwork" : "profile.gateWrong"));
    } catch {
      setMsg(i18n.t("profile.gateNetwork"));
    } finally {
      setBusy(false);
    }
  }

  if (phase === "open") return <>{children}</>;

  return (
    <View style={{ flex: 1 }}>
      <Screen padded topInset={false} testID="profile-screen">
        {phase === "locked" ? (
          <View testID="profile-gate" style={{ flex: 1, justifyContent: "center", gap: 16 }}>
            <Text variant="title">{i18n.t("profile.gateTitle")}</Text>
            <Text variant="body" color="muted">{i18n.t("profile.gatePrompt")}</Text>
            <TextInput
              testID="profile-gate-input"
              accessibilityLabel={i18n.t("profile.gateTitle")}
              value={field}
              onChangeText={setField}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              editable={!busy}
              onSubmitEditing={busy ? undefined : submit}
              placeholderTextColor={d.input.placeholder}
              style={{ minHeight: 52, paddingHorizontal: 16, borderRadius: 14, backgroundColor: d.input.bg, borderWidth: 1, borderColor: d.input.border, fontFamily: TYPE.body.fontFamily, fontSize: TYPE.body.fontSize, color: p.text }}
            />
            {msg ? <Text variant="body" color={p.stateDanger} testID="profile-gate-msg">{msg}</Text> : null}
            <Button3D testID="profile-gate-submit" full label={i18n.t("profile.gateSubmit")} onPress={submit} loading={busy} />
          </View>
        ) : null}
      </Screen>
    </View>
  );
}
