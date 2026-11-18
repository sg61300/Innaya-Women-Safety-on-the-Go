import { render } from "@testing-library/react-native";
import { ThemeProvider, palettes } from "../theme";
import { Text } from "../components/Text";
test("Text applies palette colour and caps font scaling", async () => {
  // render() is async in this project (see src/__tests__/language.test.tsx) —
  // await it so the query helpers are available.
  const { getByText } = await render(<ThemeProvider initial="violetBloom"><Text variant="body" color="muted">hello</Text></ThemeProvider>);
  const el = getByText("hello");
  expect(el.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: palettes.violetBloom.textMuted, fontSize: 16 })]));
  expect(el.props.maxFontSizeMultiplier).toBe(1.3);
});
