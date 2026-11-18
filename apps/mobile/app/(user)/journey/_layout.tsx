import { Stack } from "expo-router";

// F16 (founder live test 2026-09-07): the journey screens were flat siblings of
// the tab screens, so hardware Back popped the *tab* navigator to Home. A per-tab
// Stack keeps journey history local: editing the plan from the active journey
// (active → new) pops back to `active`, while planning from Home pops to Home.
export default function JourneyLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="new" />
      <Stack.Screen name="active" />
    </Stack>
  );
}
