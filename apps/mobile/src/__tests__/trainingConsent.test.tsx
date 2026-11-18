import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import type { Choice } from "../theme/ThemeProvider";
import { useSession } from "../store/session";
import { TERMS_VERSION, TRAINING_PROMISES } from "../data/terms";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) } }));

const mockEq = jest.fn().mockResolvedValue({ error: null });
const mockUpdate = jest.fn().mockReturnValue({ eq: (...a: unknown[]) => mockEq(...a) });
jest.mock("../lib/supabase", () => ({ supabase: { from: () => ({ update: (...a: unknown[]) => mockUpdate(...a) }) } }));

const mockLog = jest.fn().mockResolvedValue(undefined);
jest.mock("../lib/events", () => ({ events: { log: (...a: unknown[]) => mockLog(...a) } }));

import TrainingConsent from "../../app/(setup)/training-consent";

// RTL 14 (React 19 concurrent root) render is async — must be awaited.
const renderIn = (pal: Choice = "midnight") =>
  render(
    <ThemeProvider initial={pal}>
      <TrainingConsent />
    </ThemeProvider>
  );

const PALETTES: Choice[] = ["midnight", "rosePetal"];

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ userId: "u1", profile: null });
});

describe("training-data consent (C7)", () => {
  it.each(PALETTES)("shows all three promises and the mandatory ids in the %s palette", async (pal) => {
    const { getByTestId, getByText } = await renderIn(pal);
    for (const p of TRAINING_PROMISES) getByText(p);
    getByTestId("training-toggle");
    getByTestId("training-continue");
  });

  it("the toggle is off by default", async () => {
    const { getByTestId, getByLabelText } = await renderIn();
    expect(getByTestId("training-toggle").props.value).toBe(false);
    expect(getByLabelText("Use my journey data to improve detection").props.value).toBe(false);
  });

  it("Continue with the toggle off writes false, logs consent_c7, and routes home", async () => {
    const { getByTestId } = await renderIn();
    await act(async () => {
      fireEvent.press(getByTestId("training-continue"));
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ consent_c7_training: false, consent_c7_answered_at: expect.any(String) })
    );
    expect(mockEq).toHaveBeenCalledWith("id", "u1");
    expect(mockLog).toHaveBeenCalledWith("consent_c7", { version: TERMS_VERSION, on: false });
    expect(mockReplace).toHaveBeenCalledWith("/(user)/home");
  });

  it("turning the toggle on writes consent_c7_training true", async () => {
    const { getByTestId } = await renderIn();
    await act(async () => {
      fireEvent(getByTestId("training-toggle"), "valueChange", true);
    });
    await act(async () => {
      fireEvent.press(getByTestId("training-continue"));
    });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ consent_c7_training: true }));
    expect(mockLog).toHaveBeenCalledWith("consent_c7", { version: TERMS_VERSION, on: true });
  });
});
