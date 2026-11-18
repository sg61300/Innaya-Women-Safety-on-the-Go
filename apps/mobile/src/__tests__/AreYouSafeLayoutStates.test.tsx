import { render, fireEvent } from "@testing-library/react-native";
import { ThemeProvider, palettes, deriveTokens, ensureContrast, blend, toHex } from "../theme";
import { AreYouSafeLayout } from "../components/AreYouSafeLayout";

jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: "light" } }));

const base = {
  total: 5,
  typed: "",
  onTyped: jest.fn(),
  onSafe: jest.fn(),
  onDanger: jest.fn(),
} as const;

// The two visual states the task names beyond the base layout: the urgent pill
// at <=2s (critical chip colour) and the speaker-prompt caption.
test("urgent pill at <=2s uses the critical chip colour and the confirm button fires onSafe", async () => {
  const onSafe = jest.fn();
  const { getByText } = await render(
    <ThemeProvider initial="violetBloom">
      <AreYouSafeLayout {...base} seconds={2} onSafe={onSafe} speakerPromptFired={false} />
    </ThemeProvider>,
  );
  const d = deriveTokens(palettes.violetBloom, false);
  expect(getByText("ALERTING IN SECONDS").props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ color: d.chip.critical.fg })]),
  );
  fireEvent.press(getByText("I'm safe, confirm"));
  expect(onSafe).toHaveBeenCalled();
});

test("no speaker-prompt caption before the speaker prompt fires", async () => {
  const off = await render(
    <ThemeProvider initial="violetBloom">
      <AreYouSafeLayout {...base} seconds={4} speakerPromptFired={false} />
    </ThemeProvider>,
  );
  expect(off.queryByText("Listening… you can also type it")).toBeNull();
});

test("speaker-prompt caption shows once the speaker prompt has fired", async () => {
  const on = await render(
    <ThemeProvider initial="violetBloom">
      <AreYouSafeLayout {...base} seconds={4} speakerPromptFired={true} />
    </ThemeProvider>,
  );
  on.getByText("Listening… you can also type it");
});

// oceanMist is the palette where raw textMuted fails AA (4.14:1) on the brand
// wash, so the sub-title must render the contrast-guarded colour, not textMuted.
test("muted sub-title is contrast-guarded on oceanMist, never raw textMuted", async () => {
  const p = palettes.oceanMist;
  const guarded = ensureContrast(p.textMuted, toHex(blend(p.brandSoft, p.bgBase)));
  expect(guarded).not.toBe(p.textMuted); // the guard actually moves the colour here
  const s = await render(
    <ThemeProvider initial="oceanMist">
      <AreYouSafeLayout {...base} seconds={4} speakerPromptFired={false} />
    </ThemeProvider>,
  );
  const sub = s.getByText("Say your safe word.");
  expect(sub.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: guarded })]));
  expect(sub.props.style).not.toEqual(expect.arrayContaining([expect.objectContaining({ color: p.textMuted })]));
});
