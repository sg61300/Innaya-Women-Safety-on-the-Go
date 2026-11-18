import React from "react";
import { Text } from "react-native";
import { render, act } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../theme";
import { Screen } from "../components/Screen";

// s25 X1 + X3 guard: the shared Screen wrapper is the ONE place the keyboard fix
// (KeyboardAvoidingView) and the fixed-header slot live. Fixing the pattern here
// (not per screen) is the vault rule "fix the pattern, not the instance".
const renderIn = (el: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } }}>
      <ThemeProvider>{el}</ThemeProvider>
    </SafeAreaProvider>,
  );

const flush = () => act(async () => {});

describe("Screen s25 keyboard + header", () => {
  it("X1: renders a KeyboardAvoidingView around a scroll screen", async () => {
    const { getByTestId } = await renderIn(
      <Screen scroll testID="s"><Text>body</Text></Screen>,
    );
    await flush();
    expect(getByTestId("screen-kav")).toBeTruthy();
    expect(getByTestId("s-sv")).toBeTruthy();
  });

  it("X1: renders a KeyboardAvoidingView around a non-scroll screen too", async () => {
    const { getByTestId, queryByTestId } = await renderIn(
      <Screen testID="s"><Text>body</Text></Screen>,
    );
    await flush();
    expect(getByTestId("screen-kav")).toBeTruthy();
    expect(queryByTestId("s-sv")).toBeNull(); // no ScrollView on a non-scroll screen
  });

  it("X3: header slot renders OUTSIDE the scroll container", async () => {
    const { getByTestId, queryByTestId } = await renderIn(
      <Screen scroll testID="s" header={<Text testID="hdr">HEADER</Text>}>
        <Text>body</Text>
      </Screen>,
    );
    await flush();
    const header = getByTestId("screen-header");
    expect(header).toBeTruthy();
    // The header node must not be a descendant of the ScrollView.
    const sv = getByTestId("s-sv");
    const inScroll = (node: unknown, target: unknown): boolean => {
      const n = node as { children?: unknown[] };
      if (node === target) return true;
      return Array.isArray(n.children) && n.children.some((c) => inScroll(c, target));
    };
    expect(inScroll(sv, getByTestId("hdr"))).toBe(false);
  });

  it("X3: no header node is rendered when the header prop is omitted", async () => {
    const { queryByTestId } = await renderIn(
      <Screen scroll testID="s"><Text>body</Text></Screen>,
    );
    await flush();
    expect(queryByTestId("screen-header")).toBeNull();
  });
});
