import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../theme";
import type { Choice } from "../theme/ThemeProvider";
import { useSession } from "../store/session";
import { TERMS_VERSION } from "../data/terms";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) } }));

const mockEq = jest.fn().mockResolvedValue({ error: null });
const mockUpdate = jest.fn().mockReturnValue({ eq: (...a: unknown[]) => mockEq(...a) });
jest.mock("../lib/supabase", () => ({ supabase: { from: () => ({ update: (...a: unknown[]) => mockUpdate(...a) }) } }));

const mockLog = jest.fn().mockResolvedValue(undefined);
jest.mock("../lib/events", () => ({ events: { log: (...a: unknown[]) => mockLog(...a) } }));

import Consent from "../../app/(setup)/consent";

// RTL 14 (React 19 concurrent root): render is async and every fireEvent that
// triggers state must be awaited inside act(), or updates leak across act()
// boundaries (matches the safetyWordsScreen suite pattern).
// consent.tsx reads useSafeAreaInsets() (F4 bottom-inset fix), which needs a
// SafeAreaProvider with metrics — same harness pattern as disclaimerModal.test.
const renderIn = (pal: Choice = "midnight") =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } }}>
      <ThemeProvider initial={pal}>
        <Consent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
const press = (el: unknown) => act(async () => { fireEvent.press(el as never); });
// X2a: drive the disclaimer ScrollView to its end so the checkbox unlocks.
const scrollToEnd = (getByTestId: (id: string) => unknown) =>
  act(async () => {
    fireEvent.scroll(getByTestId("consent-screen-sv") as never, {
      nativeEvent: { contentOffset: { y: 900 }, contentSize: { height: 1000 }, layoutMeasurement: { height: 200 } },
    });
  });

const PALETTES: Choice[] = ["midnight", "goldenIvory"];

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ userId: "u1", profile: null });
});

describe("consent (C1) gate", () => {
  it.each(PALETTES)("renders the mandatory ids in the %s palette", async (pal) => {
    const { getByTestId } = await renderIn(pal);
    getByTestId("consent-check");
    getByTestId("consent-agree");
    getByTestId("consent-disclaimer");
  });

  // b16: the whole screen scrolls (Screen scroll); there is no nested inner
  // ScrollView for the terms — the full text is reached via the disclaimer modal.
  it("has no nested inner terms ScrollView", async () => {
    const { queryByTestId } = await renderIn();
    expect(queryByTestId("consent-terms")).toBeNull();
  });

  // X2a (founder ruling s25, supersedes s20): the checkbox is DISABLED until the
  // disclaimer is scrolled to the end; a muted hint shows the reason until then.
  // Once scrolled, the box ticks and the button unlocks.
  it("checkbox is disabled with a hint until scrolled to the end, then tappable", async () => {
    const { getByTestId, queryByTestId } = await renderIn();
    expect(getByTestId("consent-check").props.accessibilityState.disabled).toBe(true);
    expect(getByTestId("consent-scroll-hint")).toBeTruthy();
    // Tapping while disabled does nothing.
    await press(getByTestId("consent-check"));
    expect(getByTestId("consent-check").props.accessibilityState.checked).toBe(false);

    await scrollToEnd(getByTestId);
    expect(getByTestId("consent-check").props.accessibilityState.disabled).toBe(false);
    expect(queryByTestId("consent-scroll-hint")).toBeNull();
    await press(getByTestId("consent-check"));
    expect(getByTestId("consent-check").props.accessibilityState.checked).toBe(true);
    expect(getByTestId("consent-agree").props.accessibilityState.disabled).toBe(false);
  });

  // F3: a "Read the full disclaimer" link opens the shared disclaimer modal.
  it("read-disclaimer link opens the disclaimer modal", async () => {
    const { getByTestId, queryByTestId } = await renderIn();
    expect(queryByTestId("disclaimer-modal")?.props.visible).toBeFalsy();
    await press(getByTestId("consent-disclaimer"));
    expect(getByTestId("disclaimer-modal").props.visible).toBe(true);
  });

  it("agree writes the terms version, logs consent, and routes to training-consent", async () => {
    const { getByTestId } = await renderIn();
    await scrollToEnd(getByTestId);
    await press(getByTestId("consent-check"));
    await press(getByTestId("consent-agree"));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ terms_version: TERMS_VERSION, terms_accepted_at: expect.any(String) })
    );
    expect(mockEq).toHaveBeenCalledWith("id", "u1");
    expect(mockLog).toHaveBeenCalledWith("consent", { version: TERMS_VERSION });
    expect(mockReplace).toHaveBeenCalledWith("/(setup)/training-consent");
  });

  it("does not save or navigate while the box is unchecked", async () => {
    const { getByTestId } = await renderIn();
    await press(getByTestId("consent-agree"));
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
