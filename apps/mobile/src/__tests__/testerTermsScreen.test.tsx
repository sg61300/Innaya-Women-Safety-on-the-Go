import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemeProvider } from "../theme";
import type { Choice } from "../theme/ThemeProvider";
import { useSession } from "../store/session";
import {
  TESTER_TERMS_VERSION,
  TESTER_TERMS_ACCEPTED_AT_KEY,
  TESTER_TERMS_VERSION_KEY,
} from "../lib/testerTerms";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) } }));

const mockEq = jest.fn().mockResolvedValue({ error: null });
const mockUpdate = jest.fn().mockReturnValue({ eq: (...a: unknown[]) => mockEq(...a) });
jest.mock("../lib/supabase", () => ({ supabase: { from: () => ({ update: (...a: unknown[]) => mockUpdate(...a) }) } }));

const mockLog = jest.fn().mockResolvedValue(undefined);
jest.mock("../lib/events", () => ({ events: { log: (...a: unknown[]) => mockLog(...a) } }));

import TesterTerms from "../../app/(setup)/tester-terms";

// tester-terms.tsx reads useSafeAreaInsets() (bottom-inset padding), so it needs a
// SafeAreaProvider with metrics — same harness as consent.test.
const renderIn = (pal: Choice = "midnight") =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } }}>
      <ThemeProvider initial={pal}>
        <TesterTerms />
      </ThemeProvider>
    </SafeAreaProvider>
  );

const press = (el: unknown) => act(async () => { fireEvent.press(el as never); });

const PALETTES: Choice[] = ["midnight", "rosePetal"];

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useSession.setState({ userId: "u1", profile: null });
});

describe("tester-terms gate", () => {
  it.each(PALETTES)("renders the mandatory ids in the %s palette", async (pal) => {
    const { getByTestId } = await renderIn(pal);
    getByTestId("tester-terms-check");
    getByTestId("tester-terms-continue");
    getByTestId("tester-terms-full");
  });

  it("blocks: Continue before ticking the box writes nothing and does not navigate", async () => {
    const { getByTestId } = await renderIn();
    await press(getByTestId("tester-terms-continue"));
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(TESTER_TERMS_VERSION_KEY)).toBeNull();
  });

  it("acceptance persists locally, mirrors to the profile once, and routes to /", async () => {
    const { getByTestId } = await renderIn();
    await press(getByTestId("tester-terms-check"));
    await press(getByTestId("tester-terms-continue"));

    // local flag (the gate) persisted
    expect(await AsyncStorage.getItem(TESTER_TERMS_VERSION_KEY)).toBe(TESTER_TERMS_VERSION);
    const at = await AsyncStorage.getItem(TESTER_TERMS_ACCEPTED_AT_KEY);
    expect(new Date(at as string).toISOString()).toBe(at); // valid ISO date

    // server mirror called exactly once, with the version + timestamp
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ tester_terms_version: TESTER_TERMS_VERSION, tester_terms_accepted_at: expect.any(String) })
    );
    expect(mockEq).toHaveBeenCalledWith("id", "u1");
    expect(mockLog).toHaveBeenCalledWith("tester_terms", { version: TESTER_TERMS_VERSION });
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("before sign-up (no session): local flag persists, no server write, still routes", async () => {
    useSession.setState({ userId: null, profile: null });
    const { getByTestId } = await renderIn();
    await press(getByTestId("tester-terms-check"));
    await press(getByTestId("tester-terms-continue"));

    expect(await AsyncStorage.getItem(TESTER_TERMS_VERSION_KEY)).toBe(TESTER_TERMS_VERSION);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  // Stress: smallest supported width (320 dp). The screen scrolls (Screen scroll),
  // so the long hi/kn paragraphs must not stop the checkbox/Continue from working.
  it("works on a 320 dp screen (narrowest device)", async () => {
    const { getByTestId } = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } }}>
        <ThemeProvider initial="midnight">
          <TesterTerms />
        </ThemeProvider>
      </SafeAreaProvider>
    );
    await press(getByTestId("tester-terms-check"));
    await press(getByTestId("tester-terms-continue"));
    expect(await AsyncStorage.getItem(TESTER_TERMS_VERSION_KEY)).toBe(TESTER_TERMS_VERSION);
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("offline: a failing server write does not block — local flag holds and it still routes", async () => {
    mockEq.mockRejectedValueOnce(new Error("Network request failed"));
    const { getByTestId } = await renderIn();
    await press(getByTestId("tester-terms-check"));
    await press(getByTestId("tester-terms-continue"));

    expect(await AsyncStorage.getItem(TESTER_TERMS_VERSION_KEY)).toBe(TESTER_TERMS_VERSION);
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});
