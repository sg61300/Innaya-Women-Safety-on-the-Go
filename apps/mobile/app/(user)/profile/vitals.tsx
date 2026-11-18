import { Screen } from "../../../src/components/Screen";
import { ProfileBack } from "../../../src/components/ProfileChrome";
import { VitalsTab } from "../../../src/components/VitalsTab";
import i18n from "../../../src/i18n";

// profile-cards: thin wrapper over the tested VitalsTab.
export default function VitalsScreen() {
  return (
    <Screen scroll padded topInset={false} testID="profile-screen">
      <ProfileBack title={i18n.t("profile.tabVitals")} />
      <VitalsTab />
    </Screen>
  );
}
