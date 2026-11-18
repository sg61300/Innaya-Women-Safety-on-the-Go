import { View } from "react-native";
import { router } from "expo-router";
import { Screen } from "../../../src/components/Screen";
import { Text } from "../../../src/components/Text";
import { PalettePicker } from "../../../src/components/PalettePicker";
import i18n from "../../../src/i18n";

// profile-cards: thin wrapper over the tested PalettePicker (a self-contained
// bottom-sheet overlay). Closing it returns to the card list.
export default function AppearanceScreen() {
  return (
    <View style={{ flex: 1 }}>
      <Screen padded topInset={false} testID="profile-screen">
        <Text variant="title" accessibilityRole="header">{i18n.t("profile.appearance")}</Text>
        <Text variant="body" color="muted">{i18n.t("profile.appearanceHint")}</Text>
      </Screen>
      <PalettePicker onClose={() => router.back()} />
    </View>
  );
}
