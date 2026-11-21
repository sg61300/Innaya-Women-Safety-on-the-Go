import { useEffect, useRef } from "react";
import { View, Image, Linking } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { User, Shield, KeyRound, Languages, Palette, Activity, Clock, Lock } from "lucide-react-native";
import { Screen } from "../../../src/components/Screen";
import { Button3D } from "../../../src/components/Button3D";
import { ProfileCard } from "../../../src/components/ProfileChrome";
import { supabase } from "../../../src/lib/supabase";
import { frameQueue } from "../../../src/services/frameQueue";
import i18n from "../../../src/i18n";
import { Text } from "../../../src/components/Text";
import { Card } from "../../../src/components/Card";
import { links } from "../../../src/lib/links";

const supportArtwork = require("../../../assets/illustrations/support-card.png");

// profile-cards: the Profile landing screen is a vertical list of cards (was a
// horizontal tab bar). Each card pushes a thin child route wrapping an already-
// tested component, so nothing working is dropped. Order is founder-fixed.
// NOTE: no "Loud override" card — there is no user-side loud-override surface in
// the current profile to wrap (it lives on the guardian side + setup permissions
// only), so it is omitted per the brief and reported.

// Child route names that a `?section=<name>` deep link may target (home.tsx
// deep-links `?section=guardians`). Kept in one place so the list and the deep
// link cannot drift apart.
const SECTION_ROUTES: Record<string, string> = {
  details: "/(user)/profile/details",
  guardians: "/(user)/profile/guardians",
  language: "/(user)/profile/language",
  appearance: "/(user)/profile/appearance",
  vitals: "/(user)/profile/vitals",
  history: "/(user)/profile/history",
  privacy: "/(user)/profile/privacy",
};

export default function ProfileIndex() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string; reason?: string; saved?: string }>();
  const routed = useRef(false);

  // Honour `?section=<name>` deep links by routing to the matching child once
  // (after the gate in _layout has opened this screen).
  useEffect(() => {
    if (routed.current) return;
    const section = params.section ?? "";
    if (SECTION_ROUTES[section]) { routed.current = true; router.push(SECTION_ROUTES[section] as never); return; }
  }, [params.section]);

  async function logout() {
    try { await supabase.auth.signOut(); } catch (e) { console.warn("[profile] sign out failed", (e as Error).message); }
    await frameQueue.signOut();
    for (const k of ["vaira.app_password_hash", "vaira.device_salt", "vaira.account_email"]) {
      try { await SecureStore.deleteItemAsync(k); } catch { /* best-effort wipe */ }
    }
    router.replace("/(auth)/login");
  }

  const t = (k: string) => i18n.t(k);

  return (
    <Screen scroll padded topInset={false} testID="profile-screen">
      <View style={{ gap: 12, paddingVertical: 12 }}>
        {params.saved === "1" ? (
          <View style={{ padding: 14, borderRadius: 14, backgroundColor: "#EAF6EF", borderWidth: 1, borderColor: "#B8DEC6" }}>
            <Text variant="bodyStrong" color="muted">{t("profile.safetyWordsSaved")}</Text>
          </View>
        ) : null}
        <ProfileCard testID="profile-card-details" icon={User} title={t("profile.tabDetails")} description={t("profile.descDetails")} onPress={() => router.push("/(user)/profile/details" as never)} />
        <ProfileCard testID="profile-card-guardians" icon={Shield} title={t("profile.tabGuardians")} description={t("profile.descGuardians")} onPress={() => router.push("/(user)/profile/guardians" as never)} />
        <ProfileCard
          testID="profile-card-safety-words"
          icon={KeyRound}
          title={t("profile.cardSafetyWords")}
          description={t("profile.descSafetyWords")}
          onPress={() => router.push("/(setup)/safety-words?reason=edit" as never)}
        />
        <ProfileCard testID="profile-card-language" icon={Languages} title={t("profile.language")} description={t("profile.descLanguage")} onPress={() => router.push("/(user)/profile/language" as never)} />
        <ProfileCard testID="profile-card-appearance" icon={Palette} title={t("profile.appearance")} description={t("profile.descAppearance")} onPress={() => router.push("/(user)/profile/appearance" as never)} />
        <ProfileCard testID="profile-card-vitals" icon={Activity} pulse title={t("profile.tabVitals")} description={t("profile.descVitals")} onPress={() => router.push("/(user)/profile/vitals" as never)} />
        <ProfileCard testID="profile-card-history" icon={Clock} title={t("profile.tabHistory")} description={t("profile.descHistory")} onPress={() => router.push("/(user)/profile/history" as never)} />
        <ProfileCard testID="profile-card-privacy" icon={Lock} title={t("profile.tabPrivacy")} description={t("profile.descPrivacy")} onPress={() => router.push("/(user)/profile/privacy" as never)} />
      </View>

      <Card variant="raised" testID="profile-support-card" onPress={() => Linking.openURL(links.support()).catch((e) => console.warn("[profile] support link failed", e))}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Image source={supportArtwork} style={{ width: 58, height: 58, borderRadius: 16 }} accessibilityIgnoresInvertColors />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" style={{ marginBottom: 2 }}>{t("support.title")}</Text>
            <Text variant="caption" color="muted">{t("support.subtitle")}</Text>
          </View>
        </View>
      </Card>

      <View style={{ marginTop: 12 }}>
        <Button3D testID="profile-logout" variant="danger" full label={t("profile.logout")} onPress={logout} />
      </View>
    </Screen>
  );
}
