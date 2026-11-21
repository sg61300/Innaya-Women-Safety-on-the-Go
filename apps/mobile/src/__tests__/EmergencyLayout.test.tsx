import { render, fireEvent, act } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { EmergencyLayout } from "../components/EmergencyLayout";

// render() commits asynchronously here; the background pulse also reads
// reduce-motion async (jest.setup reports it ON), so flush that read in act.
const items = [{ label: "Guardians notified", done: true, detail: "Amma, Deepa" }, { label: "Siren on", done: true }];
test("critical copy and cancel button", async () => {
  const onCancel = jest.fn();
  const { getByText, queryByText } = await render(<ThemeProvider initial="violetBloom"><EmergencyLayout state="CRITICAL" elapsedS={63} items={items} onCancelPress={onCancel} /></ThemeProvider>);
  await act(async () => {});
  getByText("Help is being called."); getByText("01:03 · Siren on · Max volume"); getByText("Even if this phone dies, your guardians keep getting updates.");
  fireEvent.press(getByText("I'm safe, cancel")); expect(onCancel).toHaveBeenCalled();
  expect(queryByText(/Police/)).toBeNull();
});
// H4: at 320 dp the CRITICAL heading grew to 3 lines and clipped. The title must
// shrink to fit (adjustsFontSizeToFit) within a bounded number of lines and carry
// no fixed width, so it wraps/scales instead of overflowing on a narrow screen.
test("H4: CRITICAL heading scales to fit and is not fixed-width", async () => {
  const { getByTestId } = await render(<ThemeProvider initial="violetBloom"><EmergencyLayout state="CRITICAL" elapsedS={0} items={items} onCancelPress={() => {}} /></ThemeProvider>);
  await act(async () => {});
  const title = getByTestId("emergency-title");
  expect(title.props.adjustsFontSizeToFit).toBe(true);
  expect(title.props.numberOfLines).toBe(2);
  const flat = Array.isArray(title.props.style) ? Object.assign({}, ...title.props.style.flat()) : title.props.style;
  expect(flat.width).toBeUndefined();
});
test("emergency copy", async () => {
  const { getByText } = await render(<ThemeProvider initial="violetBloom"><EmergencyLayout state="EMERGENCY" elapsedS={5} items={items} onCancelPress={() => {}} /></ThemeProvider>);
  await act(async () => {});
  getByText("We're checking on you."); getByText("I'm safe now");
});
