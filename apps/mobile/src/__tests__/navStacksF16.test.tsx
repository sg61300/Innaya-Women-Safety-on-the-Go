import React from "react";
import { Text } from "react-native";
import { Tabs } from "expo-router";
import { getMockConfig } from "expo-router/testing-library";
import RegionsLayout from "../../app/(user)/regions/_layout";
import JourneyLayout from "../../app/(user)/journey/_layout";

// F16 (founder live test 2026-09-07): hardware Back from a detail screen landed on
// Home, not the parent list, because the detail routes (regions/[id], regions/report,
// journey/new, journey/active) were FLAT siblings of the tab screens. In a tab
// navigator, Back returns to the first tab (Home) — there is no per-tab push history.
//
// The fix nests each detail under its tab's own Stack (regions/_layout,
// journey/_layout), so the tab holds a Stack whose root is the list and whose
// children are the details — hardware Back then pops the Stack to the list.
//
// This test builds the route tree from the REAL nested _layouts and asserts the
// resulting expo-router navigation config: the detail routes are CHILDREN of the
// regions / journey navigators, not siblings of the tabs. That nesting is the
// necessary-and-sufficient structural cause of correct Back behaviour. (Runtime
// back-pop is proven on device; expo-router's own testRouter/global-router harness
// does not bind to the in-memory store in this build — see handoff.)
const stub = () => () => <Text>x</Text>;

function buildConfig() {
  return getMockConfig({
    _layout: () => (
      <Tabs>
        <Tabs.Screen name="home" />
        <Tabs.Screen name="regions" />
        <Tabs.Screen name="journey" options={{ href: null }} />
      </Tabs>
    ),
    home: stub(),
    "regions/_layout": RegionsLayout,
    "regions/index": stub(),
    "regions/[id]": stub(),
    "regions/report": stub(),
    "journey/_layout": JourneyLayout,
    "journey/new": stub(),
    "journey/active": stub(),
  }) as any;
}

test("regions detail + report are nested under the regions Stack, not tab siblings", () => {
  const tabs = buildConfig().screens.__root.screens;
  // The tab level holds `regions` as a navigator (object with its own screens),
  // and the detail routes are NOT present at the tab level.
  expect(typeof tabs.regions).toBe("object");
  expect(tabs["regions/[id]"]).toBeUndefined();
  expect(tabs["regions/report"]).toBeUndefined();
  const regions = tabs.regions.screens;
  expect(Object.keys(regions).sort()).toEqual(["[id]", "index", "report"]);
  expect(regions.index).toBe(""); // the list is the Stack root
});

test("journey screens are nested under the journey Stack, not tab siblings", () => {
  const tabs = buildConfig().screens.__root.screens;
  expect(typeof tabs.journey).toBe("object");
  expect(tabs["journey/new"]).toBeUndefined();
  expect(tabs["journey/active"]).toBeUndefined();
  expect(Object.keys(tabs.journey.screens).sort()).toEqual(["active", "new"]);
});
