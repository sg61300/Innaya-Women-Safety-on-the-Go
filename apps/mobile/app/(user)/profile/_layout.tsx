import { Stack } from "expo-router";
import { ProfileGate } from "../../../src/components/ProfileGate";

// profile-cards + F16: Profile is a vertical list of cards (index) that push to
// thin child screens, each wrapping an already-tested component. Nesting them in
// a per-tab Stack (like regions/journey) makes hardware Back pop to the list, not
// to Home. The whole Stack sits behind the app-password gate, so every child
// route — including a `?section=<name>` deep link resolved by `index` — is
// reached only after the gate opens.
export default function ProfileLayout() {
  return (
    <ProfileGate>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="details" />
        <Stack.Screen name="guardians" />
        <Stack.Screen name="language" />
        <Stack.Screen name="appearance" />
        <Stack.Screen name="vitals" />
        <Stack.Screen name="history" />
        <Stack.Screen name="privacy" />
      </Stack>
    </ProfileGate>
  );
}
