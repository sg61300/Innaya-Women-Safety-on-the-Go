import { render } from "@testing-library/react-native";
import { ThemeProvider, palettes, deriveTokens } from "../theme";
import { SafeWordStrength } from "../components/SafeWordStrength";

// SafeWordStrength pulls in secureWords, which imports the supabase client at
// module load; stub it so the client is not constructed in the test env.
jest.mock("../lib/supabase", () => ({ supabase: {} }));

// render() is async in this project (React 19 concurrent) — await it.
const w = (el: React.ReactElement) =>
  render(<ThemeProvider initial="violetBloom">{el}</ThemeProvider>);
const d = deriveTokens(palettes.violetBloom, false);

test.each([
  ["ok", "Weak", d.chip.danger.fg, 1],
  ["violet", "OK", d.chip.amber.fg, 2],
  ["purple mountain", "Strong", d.chip.safe.fg, 3],
] as const)("word %s → %s chip in the matching chip colour", async (word, label, fg, filled) => {
  const { getByText, getByTestId } = await w(<SafeWordStrength word={word} />);
  expect(getByText(label).props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ color: fg })]),
  );
  // the bar fills 1/2/3 segments with the same colour
  for (let i = 0; i < 3; i++) {
    const seg = getByTestId(`safewordstrength-seg-${i}`);
    const bg = (Array.isArray(seg.props.style) ? seg.props.style : [seg.props.style])
      .reduce((a: any, s: any) => ({ ...a, ...s }), {}).backgroundColor;
    expect(bg).toBe(i < filled ? fg : palettes.violetBloom.border);
  }
});
