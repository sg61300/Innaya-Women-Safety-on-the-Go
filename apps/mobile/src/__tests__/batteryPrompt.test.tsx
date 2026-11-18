import React from "react";
import { render, act, fireEvent } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { useJourney } from "../store/journey";

jest.mock("expo-haptics", () => ({ impactAsync: jest.fn().mockResolvedValue(undefined), ImpactFeedbackStyle: { Medium: 1 } }));

import { BatteryPrompt } from "../components/BatteryPrompt";

const mount = async () => {
  let out: ReturnType<typeof render>;
  await act(async () => {
    out = render(<ThemeProvider><BatteryPrompt /></ThemeProvider>);
  });
  return out!;
};

beforeEach(() => useJourney.getState().reset());

test("renders nothing until a charge prompt is raised", async () => {
  const { queryByTestId } = await mount();
  expect(queryByTestId("battery-prompt")).toBeNull();
});

test("shows the N % charge nudge and Continue clears it (never a challenge/siren)", async () => {
  const { getByTestId, queryByTestId } = await mount();
  await act(async () => { useJourney.getState().set({ batteryPrompt: { pct: 18 } }); });
  expect(getByTestId("battery-prompt")).toBeTruthy();
  expect(getByTestId("battery-prompt-body").props.children).toContain("18");
  await act(async () => { fireEvent.press(getByTestId("battery-prompt-continue")); });
  expect(queryByTestId("battery-prompt")).toBeNull();
  expect(useJourney.getState().batteryPrompt).toBeNull();
});
