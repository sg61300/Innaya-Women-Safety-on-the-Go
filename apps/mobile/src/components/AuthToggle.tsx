import { View, Pressable } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../theme";
import { Text } from "./Text";
import i18n from "../i18n";

// "Log in | Sign up" pill toggle (Design/02 §4.2). The active side is filled with
// the guarded brand-soft chip; tapping the other side swaps the auth route.
export function AuthToggle({ active }: { active: "login" | "signup" }) {
  const { p, d } = useTheme();
  const seg = (key: "login" | "signup", label: string, target: "/(auth)/login" | "/(auth)/signup") => {
    const on = active === key;
    return (
      <Pressable
        testID={`auth-toggle-${key}`}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: on }}
        onPress={() => { if (!on) router.replace(target); }}
        style={{ flex: 1, minHeight: 48, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: on ? d.chip.brand.bg : "transparent" }}
      >
        <Text variant="bodyStrong" color={on ? d.chip.brand.fg : p.textMuted}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: "row", padding: 4, gap: 4, borderRadius: 999, backgroundColor: p.bgRaised, borderWidth: 1, borderColor: p.border, marginBottom: 20 }}>
      {seg("login", i18n.t("auth.toggleLogin"), "/(auth)/login")}
      {seg("signup", i18n.t("auth.toggleSignup"), "/(auth)/signup")}
    </View>
  );
}
