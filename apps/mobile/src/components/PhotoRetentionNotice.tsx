import { View, Pressable, Linking } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { links } from "../lib/links";
import i18n from "../i18n";

// Fix lane D6 (founder Q127): trip photos are kept 30 days on the server, then deleted;
// to delete them sooner she emails the help address (the existing support link).
// Shown on the privacy screen and in the after-trip photo prompt.
export function PhotoRetentionNotice() {
  const { p } = useTheme();
  return (
    <View testID="photo-retention" style={{ gap: 4 }}>
      <Text variant="body">{i18n.t("photoRetention.body")}</Text>
      <Pressable
        accessibilityRole="button"
        testID="photo-retention-email"
        onPress={() => Linking.openURL(links.support()).catch((e) => console.warn("[photoRetention] support link failed", (e as Error)?.message))}
        hitSlop={8}
        style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}
      >
        <Text variant="bodyStrong" color={p.brand}>{i18n.t("photoRetention.email")}</Text>
      </Pressable>
    </View>
  );
}
