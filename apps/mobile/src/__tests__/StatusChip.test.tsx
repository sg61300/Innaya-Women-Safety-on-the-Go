import { render } from "@testing-library/react-native";
import { ThemeProvider, palettes, deriveTokens } from "../theme";
import { StatusChip } from "../components/StatusChip";

jest.useFakeTimers().setSystemTime(new Date("2026-09-04T12:00:00Z"));
// render() is async in this project (see src/__tests__/Text.test.tsx) — await it.
const w = (el: React.ReactElement) =>
  render(<ThemeProvider initial="violetBloom">{el}</ThemeProvider>);

test.each([
  ["idle", "Not travelling"],
  ["IDLE", "Not travelling"],
  ["ARMED", "Monitoring starts soon"],
  ["SAFE", "Journey active · Safe"],
  ["AMBER", "Amber. Checking on you"],
  ["LATE_CHECK", "Amber. Checking on you"],
  ["EMERGENCY", "Emergency"],
  ["CRITICAL", "Critical. Help is coming"],
  ["CANCEL_HOLD", "Critical. Help is coming"],
  ["RESOLVED_MONITORING", "Alarm cancelled. Watching closely"],
  ["RESOLVED", "Arrived safely"],
] as const)("%s → %s", async (s, label) => {
  (await w(<StatusChip state={s as any} />)).getByText(label);
});

test("countdown copy ticks from startAt", async () => {
  (await w(<StatusChip state="countdown" startAt={Date.now() + 7 * 60_000 + 42_000} />)).getByText(
    "Monitoring starts in 07:42",
  );
});

test("EMERGENCY maps to the danger chip kind (colour)", async () => {
  const d = deriveTokens(palettes.violetBloom, false);
  const { getByText } = await w(<StatusChip state={"EMERGENCY" as any} />);
  expect(getByText("Emergency").props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ color: d.chip.danger.fg })]),
  );
});
