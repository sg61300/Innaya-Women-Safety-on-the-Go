import { render, act } from "@testing-library/react-native";
import { Text as RNText, AccessibilityInfo } from "react-native";
import { ThemeProvider } from "../theme";
import { EmergencyLayout } from "../components/EmergencyLayout";
import { useJourney } from "../store/journey";

const items = [{ label: "Guardians notified", done: true, detail: "Amma, Deepa" }, { label: "Siren on", done: true }];

test("F3: camera status shows not running by default, and 'sending frames' when frames flow", async () => {
  useJourney.getState().set({ camRunning: false, camLastFrameAt: null });
  const s = await render(<ThemeProvider initial="violetBloom"><EmergencyLayout state="CRITICAL" elapsedS={1} items={items} onCancelPress={() => {}} /></ThemeProvider>);
  await act(async () => {});
  s.getByText("Camera: not running");
  await act(async () => { useJourney.getState().set({ camRunning: true, camLastFrameAt: Date.now() - 4000 }); });
  s.getByText(/Camera: sending frames/);
  useJourney.getState().set({ camRunning: false, camLastFrameAt: null });
});

test("non-finite elapsedS renders 00:00 instead of NaN", async () => {
  const s = await render(<ThemeProvider initial="violetBloom"><EmergencyLayout state="EMERGENCY" elapsedS={NaN} items={items} onCancelPress={() => {}} /></ThemeProvider>);
  await act(async () => {});
  s.getByText("00:00");
});

test("subscribes to reduceMotionChanged on mount and removes the listener on unmount", async () => {
  const remove = jest.fn();
  const spy = jest.spyOn(AccessibilityInfo, "addEventListener").mockReturnValue({ remove } as any);
  const s = await render(<ThemeProvider initial="violetBloom"><EmergencyLayout state="EMERGENCY" elapsedS={1} items={items} onCancelPress={() => {}} /></ThemeProvider>);
  await act(async () => {});
  expect(spy).toHaveBeenCalledWith("reduceMotionChanged", expect.any(Function));
  await act(async () => { s.unmount(); });
  expect(remove).toHaveBeenCalled();
  spy.mockRestore();
});

test("EMERGENCY line is mm:ss only (no siren suffix)", async () => {
  const s = await render(<ThemeProvider initial="violetBloom"><EmergencyLayout state="EMERGENCY" elapsedS={63} items={items} onCancelPress={() => {}} /></ThemeProvider>);
  await act(async () => {});
  s.getByText("01:03");
  expect(s.queryByText(/Siren on · Max volume/)).toBeNull();
});

test("CANCEL_HOLD renders the children slot AND keeps the 'Not an emergency' button (ADR-043)", async () => {
  const s = await render(
    <ThemeProvider initial="violetBloom">
      <EmergencyLayout state="CANCEL_HOLD" elapsedS={4} items={items} onCancelPress={() => {}}>
        <RNText>HOLD SHEET</RNText>
      </EmergencyLayout>
    </ThemeProvider>,
  );
  await act(async () => {});
  s.getByTestId("emergency-hold-slot");
  s.getByText("HOLD SHEET");
  // ADR-043 rule 3: the cancel button stays available under the siren/hold.
  s.getByTestId("emergency-cancel");
});

test("CANCEL_HOLD keeps the critical copy (siren-on line) and renders children", async () => {
  const s = await render(
    <ThemeProvider initial="violetBloom">
      <EmergencyLayout state="CANCEL_HOLD" elapsedS={4} items={items} onCancelPress={() => {}}>
        <RNText>HOLD SHEET</RNText>
      </EmergencyLayout>
    </ThemeProvider>,
  );
  await act(async () => {});
  s.getByText("Help is being called.");
  s.getByText(/Siren on · Max volume/);
  s.getByTestId("emergency-hold-slot");
  s.getByText("HOLD SHEET");
});
