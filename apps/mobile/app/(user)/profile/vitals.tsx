import { Screen } from "../../../src/components/Screen";
import { Text } from "../../../src/components/Text";
import { VitalsTab } from "../../../src/components/VitalsTab";
import i18n from "../../../src/i18n";

// profile-cards: thin wrapper over the tested VitalsTab.
export default function VitalsScreen() {
  return (
    <Screen scroll padded topInset={false} testID="profile-screen">
      <Text variant="title" accessibilityRole="header">{i18n.t("profile.tabVitals")}</Text>
      <VitalsTab />
    </Screen>
  );
}
