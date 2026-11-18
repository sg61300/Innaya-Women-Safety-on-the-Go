import { render, fireEvent } from "@testing-library/react-native";
import { ThemeProvider, palettes, deriveTokens } from "../theme";
import { SensorPill } from "../components/SensorPill";

// render() is async in this project (see src/__tests__/Text.test.tsx) — await it.
const wrap = (el: React.ReactElement) =>
  render(<ThemeProvider initial="violetBloom">{el}</ThemeProvider>);
const d = deriveTokens(palettes.violetBloom, false);

test.each([
  ["camera", "Camera"],
  ["voice", "Voice"],
  ["vitals", "Vitals"],
  ["gps", "GPS"],
] as const)("%s renders its i18n label", async (sensor, label) => {
  (await wrap(<SensorPill sensor={sensor as any} on />)).getByText(label);
});

test("on → filled safe foreground; off → muted foreground", async () => {
  const on = (await wrap(<SensorPill sensor="gps" on />)).getByText("GPS");
  expect(on.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ color: d.chip.safe.fg })]),
  );
  const off = (await wrap(<SensorPill sensor="gps" on={false} />)).getByText("GPS");
  expect(off.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ color: palettes.violetBloom.textMuted })]),
  );
});

test("degraded → amber foreground even when on", async () => {
  const el = (await wrap(<SensorPill sensor="camera" on degraded />)).getByText("Camera");
  expect(el.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ color: d.chip.amber.fg })]),
  );
});

test("missing i18n key falls back to the raw key", async () => {
  (await wrap(<SensorPill sensor={"unknown" as any} on />)).getByText("sensor.unknown");
});

test("onPress makes it an accessible button and fires", async () => {
  const onPress = jest.fn();
  const { getByTestId } = await wrap(<SensorPill sensor="voice" on onPress={onPress} />);
  const btn = getByTestId("sensor-pill-voice");
  expect(btn.props.accessibilityRole).toBe("button");
  fireEvent.press(btn);
  expect(onPress).toHaveBeenCalledTimes(1);
});
