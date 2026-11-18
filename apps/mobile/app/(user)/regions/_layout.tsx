import { Stack } from "expo-router";

// F16 (founder live test 2026-09-07): the region list, its detail and the report
// route were flat siblings of the tab screens, so hardware Back from a detail
// popped the *tab* navigator to Home. Nesting them in a per-tab Stack makes Back
// pop to the parent list. `index` is the list; `[id]` and `report` push onto it.
export default function RegionsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="report" />
      <Stack.Screen name="my-reports" />
    </Stack>
  );
}
