// ADR-043 item 3 — the calm silent-alert screen (own file: a leftover Modal from
// the SOS-mode-sheet suite blanks a plain-View render in the same file).
import { cleanup, fireEvent, render } from "@testing-library/react-native";
import { ThemeProvider, palettes } from "../theme";
import { SilentAlarmScreen } from "../components/SilentAlarmScreen";

afterEach(() => cleanup());
const wrap = (el: React.ReactElement) => render(<ThemeProvider initial="violetBloom">{el}</ThemeProvider>);

it("shows the guardian count and a visible Not-an-emergency button", async () => {
  const onNotEmergency = jest.fn();
  const { getByTestId } = await wrap(<SilentAlarmScreen guardianCount={3} onNotEmergency={onNotEmergency} />);
  expect(getByTestId("silent-guardians").props.children).toContain("3");
  fireEvent.press(getByTestId("silent-not-emergency"));
  expect(onNotEmergency).toHaveBeenCalledTimes(1);
});

it("uses the calm brandSoft ground, never the alarm (sos) colour", async () => {
  const { getByTestId } = await wrap(<SilentAlarmScreen guardianCount={1} onNotEmergency={jest.fn()} />);
  const bg = getByTestId("silent-alarm-screen").props.style.backgroundColor;
  expect(bg).toBe(palettes.violetBloom.brandSoft);
  expect(bg).not.toBe(palettes.violetBloom.sos);
});
