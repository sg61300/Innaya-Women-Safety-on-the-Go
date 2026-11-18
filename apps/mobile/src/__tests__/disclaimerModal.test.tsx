import React, { useState } from "react";
import { Pressable, Text as RNText } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { render, fireEvent, act } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { DisclaimerModal } from "../components/DisclaimerModal";

// F10: the sign-up disclaimer is a button that opens the full legal text in a
// scrollable pop-up with a close control.
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider initial="midnight">
        <Pressable testID="open" onPress={() => setOpen(true)}><RNText>open</RNText></Pressable>
        <DisclaimerModal visible={open} onClose={() => setOpen(false)} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

test("opens the full disclaimer and closes it", async () => {
  const { getByTestId, queryByTestId } = await render(<Harness />);
  await act(async () => {});
  expect(queryByTestId("disclaimer-scroll")).toBeNull();
  await act(async () => { fireEvent.press(getByTestId("open")); });
  getByTestId("disclaimer-scroll");
  await act(async () => { fireEvent.press(getByTestId("disclaimer-close")); });
  expect(queryByTestId("disclaimer-scroll")).toBeNull();
});
