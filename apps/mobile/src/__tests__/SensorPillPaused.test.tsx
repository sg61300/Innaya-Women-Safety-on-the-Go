import { render } from "@testing-library/react-native";
import { ThemeProvider, palettes } from "../theme";
import { SensorPill } from "../components/SensorPill";

// Pre-35 item B (ADR-038): a paused camera pill shows only "Camera off",
// in the neutral/off outline style, and never the bare "Camera" label.
const wrap = (el: React.ReactElement) =>
  render(<ThemeProvider initial="violetBloom">{el}</ThemeProvider>);

test("paused → shows 'Camera off' and not the bare 'Camera' label", async () => {
  const { getByText, queryByText } = await wrap(<SensorPill sensor="camera" on paused />);
  getByText("Camera off");
  expect(queryByText("Camera")).toBeNull();
});

test("paused pill uses the muted/off foreground even when on", async () => {
  const el = (await wrap(<SensorPill sensor="camera" on paused />)).getByText("Camera off");
  expect(el.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ color: palettes.violetBloom.textMuted })]),
  );
});

test("paused a11y label reads 'Camera off, paused'", async () => {
  const { getByTestId } = await wrap(<SensorPill sensor="camera" on paused />);
  expect(getByTestId("sensor-pill-camera").props.accessibilityLabel).toBe("Camera off, paused");
});

test("without paused, an on camera pill is unaffected", async () => {
  const { getByText, queryByText } = await wrap(<SensorPill sensor="camera" on />);
  getByText("Camera");
  expect(queryByText("Camera off")).toBeNull();
});
