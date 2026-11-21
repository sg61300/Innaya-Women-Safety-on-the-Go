import React from "react";
import { render, act } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { ThemeProvider } from "../theme";
import { BrandLockup } from "../components/BrandLockup";

// jest.setup reports reduce-motion ON by default; these tests exercise both the
// static (reduce-motion) and animated branches, flushing the async read in act.
test("renders the lockup with reduce-motion on (static frame)", async () => {
  (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
  const { getByLabelText } = await render(
    <ThemeProvider initial="midnight">
      <BrandLockup />
    </ThemeProvider>
  );
  getByLabelText("INNAYA");
});

test("renders the lockup with reduce-motion off (animated branch)", async () => {
  (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(false);
  const { getByLabelText } = await render(
    <ThemeProvider initial="violetBloom">
      <BrandLockup />
    </ThemeProvider>
  );
  // Flush the async reduce-motion read + animation start inside act.
  await act(async () => {});
  getByLabelText("INNAYA");
});
