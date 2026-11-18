import { render } from "@testing-library/react-native";
import { ThemeProvider, palettes, deriveTokens } from "../theme";
import { Chip } from "../components/Chip";
test("chip uses the derived contrast-safe colours", async () => {
  const d = deriveTokens(palettes.violetBloom, false);
  const { getByText } = await render(<ThemeProvider initial="violetBloom"><Chip kind="safe" label="Journey active · Safe" /></ThemeProvider>);
  expect(getByText("Journey active · Safe").props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: d.chip.safe.fg })]));
});
