import { Modal, View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { Illustration } from "./Illustration";
import { BULLETS, FULL_TERMS } from "../data/terms";
import i18n from "../i18n";

// F10 (founder live test 2026-09-07): the sign-up disclaimer was a tiny box.
// This is the full disclaimer, opened from a "Read the full disclaimer" button.
// The legal WORDING stays sourced from src/data/terms (FULL_TERMS) — the single
// version-pinned source recorded on acceptance — so the pop-up can never drift
// from what the user actually agreed to. Only the chrome (title / close) is
// localised via i18n consent keys, with EN/HI/KN parity.
export function DisclaimerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { p, d } = useTheme();
  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent onRequestClose={onClose} testID="disclaimer-modal">
      <SafeAreaView style={{ flex: 1, backgroundColor: p.bgBase }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, minHeight: 56, borderBottomWidth: 1, borderBottomColor: p.border }}>
          <Text variant="title">{i18n.t("consent.heading")}</Text>
          <Pressable testID="disclaimer-close" accessibilityRole="button" accessibilityLabel={i18n.t("consent.close")} onPress={onClose} hitSlop={12} style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}>
            <X size={22} color={p.text} />
          </Pressable>
        </View>
        <ScrollView testID="disclaimer-scroll" contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          <View style={{ alignItems: "center", marginBottom: 12 }}>
            <Illustration name="consent-disclaimer" size={88} />
          </View>
          {BULLETS.map((b) => (
            <View key={b} style={{ flexDirection: "row", marginBottom: 10 }}>
              <Text variant="body" color="muted" style={{ marginRight: 8 }}>•</Text>
              <Text variant="body" color="muted" style={{ flex: 1 }}>{b}</Text>
            </View>
          ))}
          <View style={{ height: 1, backgroundColor: d.card.border, marginVertical: 12 }} />
          <Text variant="caption" color="muted">{FULL_TERMS}</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
