import { render, fireEvent, act } from "@testing-library/react-native";
import { ThemeProvider, useTheme } from "../theme";
import { PalettePicker } from "../components/PalettePicker";
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
function Probe() { const { palette } = useTheme(); return <>{/* @ts-ignore */}<PalettePicker onClose={() => {}} /><ProbeText v={palette} /></>; }
import { Text as RNText } from "react-native";
const ProbeText = ({ v }: { v: string }) => <RNText testID="probe">{v}</RNText>;
// NOTE: this project's RNTL render resolves a promise (React 19 concurrent root);
// awaited here to match every other suite. Assertions are unchanged from the brief.
test("lists all 8 palettes and switches live", async () => {
  const { getByText, getByTestId } = await render(<ThemeProvider initial="violetBloom"><Probe /></ThemeProvider>);
  for (const l of ["Midnight", "Violet Bloom", "Rose Petal", "Blush Lavender", "Ocean Mist", "Golden Ivory", "Sakura Dawn", "Dark Cherry", "Follow system"]) getByText(l);
  // Concurrent root: flush the setPalette state update before asserting live switch.
  await act(async () => { fireEvent.press(getByText("Sakura Dawn")); });
  expect(getByTestId("probe").props.children).toBe("sakuraDawn");
});
