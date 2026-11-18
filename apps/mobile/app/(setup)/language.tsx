import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import i18n, { LANGS, setLanguage, type Lang } from "../../src/i18n";
import { supabase } from "../../src/lib/supabase";
import { useSession } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Card } from "../../src/components/Card";
import { BrandLockup } from "../../src/components/BrandLockup";

// Language picker (Task 16b, ADR-018; restyled Pre-35 item A with the merged
// kit). New installs see it before signup; a signed-in user can reach it to
// change language.
export default function LanguageScreen() {
  const router = useRouter();
  const { p } = useTheme();
  const userId = useSession((s) => s.userId);
  const setProfile = useSession((s) => s.set);
  const profile = useSession((s) => s.profile);

  async function choose(code: Lang) {
    await setLanguage(code);
    if (userId) {
      const { error } = await supabase.from("profiles").update({ language: code }).eq("id", userId);
      if (error) console.warn("[language] profile update failed", error.message);
      else setProfile({ profile: { ...(profile ?? {}), language: code } });
    }
    // Both branches return to "/" so app/index.tsx re-runs decideRoute with the
    // language now stored: no session → login; session → the next onboarding
    // step. A cold start reaches this screen via router.replace (no back entry),
    // so router.back() here would strand the user on the picker.
    router.replace("/");
  }

  return (
    <Screen
      scroll
      padded
      header={
        // X3 (s25): the brand lockup stays fixed while the language list scrolls.
        <View style={{ paddingTop: 24, paddingBottom: 8 }}>
          <BrandLockup />
        </View>
      }
    >
      <Text variant="title" color="primary" style={{ marginTop: 8 }}>{i18n.t("language.title")}</Text>
      <Text variant="body" color="muted" style={{ marginTop: 4, marginBottom: 16 }}>{i18n.t("language.sub")}</Text>

      <View style={{ gap: 12 }}>
        {LANGS.map((l) => (
          <Pressable
            key={l.code}
            testID={`lang-${l.code}`}
            accessibilityRole="button"
            accessibilityLabel={l.label}
            onPress={() => choose(l.code)}
          >
            <Card variant="raised" style={{ minHeight: 72, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text variant="title" color="primary">{l.label}</Text>
                <Text variant="caption" color="muted" style={{ marginTop: 2 }}>{i18n.t(`language.englishName.${l.code}`)}</Text>
              </View>
              <ChevronRight size={22} color={p.textMuted} strokeWidth={2} />
            </Card>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
