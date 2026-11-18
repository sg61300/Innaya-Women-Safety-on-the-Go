import { useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import { Screen } from "../../../src/components/Screen";
import { Text } from "../../../src/components/Text";
import { Card } from "../../../src/components/Card";
import { useTheme } from "../../../src/theme";
import { supabase } from "../../../src/lib/supabase";
import i18n, { LANGS, setLanguage, type Lang } from "../../../src/i18n";

// profile-cards: the EN/HI/KN selector lifted from the old profile screen.
// F5/F15: switch in place, persist to the profile, re-render (i18n.language is
// not reactive on its own).
export default function LanguageScreen() {
  const { p, d } = useTheme();
  const [userId, setUserId] = useState<string | null>(null);
  const [, setBump] = useState(0);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id ?? null)).catch(() => {}); }, []);

  async function chooseLang(code: Lang) {
    if (i18n.language === code) return;
    await setLanguage(code);
    setBump((n) => n + 1);
    if (userId) {
      supabase.from("profiles").update({ language: code }).eq("id", userId)
        .then(({ error }) => { if (error) console.warn("[profile] language save failed", error.message); });
    }
  }

  return (
    <Screen scroll padded topInset={false} testID="profile-screen">
      <Text variant="title" accessibilityRole="header">{i18n.t("profile.language")}</Text>
      <Card style={{ gap: 4 }}>
        {LANGS.map((l) => {
          const on = i18n.language === l.code;
          return (
            <Pressable
              key={l.code}
              accessibilityRole="button"
              accessibilityLabel={l.label}
              accessibilityState={{ selected: on }}
              testID={`profile-lang-${l.code}`}
              onPress={() => chooseLang(l.code)}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                minHeight: 52, paddingHorizontal: 4, opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text variant="body">{l.label}</Text>
              {on ? <Text variant="body" color={p.brand}>✓</Text> : null}
            </Pressable>
          );
        }).reduce<React.ReactNode[]>((acc, node, i) => {
          if (i > 0) acc.push(<View key={`sep-${i}`} style={{ height: 1, backgroundColor: d.card.border }} />);
          acc.push(node);
          return acc;
        }, [])}
      </Card>
    </Screen>
  );
}
