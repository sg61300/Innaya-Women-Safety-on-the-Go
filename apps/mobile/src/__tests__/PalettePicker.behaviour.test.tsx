import { render, fireEvent, act } from "@testing-library/react-native";
import { Text as RNText } from "react-native";
import { ThemeProvider, useTheme } from "../theme";
import { PalettePicker } from "../components/PalettePicker";
import i18n from "../i18n";
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

const ProbeText = ({ v }: { v: string }) => <RNText testID="probe">{v}</RNText>;
function Probe() {
  const { palette } = useTheme();
  return <>{/* @ts-ignore */}<PalettePicker onClose={() => {}} /><ProbeText v={palette} /></>;
}

// F3: the "Done" label and the backdrop accessibility label go through i18n.
test("Done and the backdrop close label come from i18n", async () => {
  const r = await render(<ThemeProvider initial="violetBloom"><PalettePicker onClose={() => {}} /></ThemeProvider>);
  r.getByText(i18n.t("appearance.done"));
  r.getByLabelText(i18n.t("appearance.close"));
});

// F4: exactly the two dark palettes carry a Dark chip.
test("renders a Dark chip only for the two dark palettes", async () => {
  const r = await render(<ThemeProvider initial="violetBloom"><PalettePicker onClose={() => {}} /></ThemeProvider>);
  expect(r.getAllByText(i18n.t("appearance.dark")).length).toBe(2);
});

// F4: Follow system returns the live palette to the system-resolved default.
test("Follow system resets the live palette to the system default", async () => {
  const r = await render(<ThemeProvider initial="darkCherry"><Probe /></ThemeProvider>);
  expect(r.getByTestId("probe").props.children).toBe("darkCherry");
  await act(async () => { fireEvent.press(r.getByText(i18n.t("appearance.followSystem"))); });
  expect(r.getByTestId("probe").props.children).toBe("violetBloom");
});
