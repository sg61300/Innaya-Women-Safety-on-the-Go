import { render } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { ThemeProvider, palettes, deriveTokens } from "../theme";
import { CountdownRing, CountdownNumeral } from "../components/CountdownRing";

const R = 150 / 2 - 8;
const C = 2 * Math.PI * R;
// render() is async in this project (see src/__tests__/Text.test.tsx) — await it.
const wrap = (el: React.ReactElement) =>
  render(<ThemeProvider initial="violetBloom">{el}</ThemeProvider>);
const dashLen = (el: any) => parseFloat(String(el.props.strokeDasharray).split(/[ ,]/)[0]);

test("numeral, a11y label and urgent colour", async () => {
  const calm = await wrap(<CountdownRing seconds={5} total={5} />);
  calm.getByText("5");
  calm.getByLabelText("5 seconds");
  // seconds (2) <= urgentAt (2) → numeral turns the SOS colour.
  const urgent = await wrap(<CountdownRing seconds={2} total={5} />);
  expect(urgent.getByText("2").props.style).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ color: deriveTokens(palettes.violetBloom, false).sos }),
    ]),
  );
});

test("CountdownNumeral is the same component (alias export)", () => {
  expect(CountdownNumeral).toBe(CountdownRing);
});

test("progress arc: complete, partial and zero", async () => {
  const full = (await wrap(<CountdownRing seconds={5} total={5} />)).getByTestId("countdownring-progress");
  expect(dashLen(full)).toBeCloseTo(C, 1);

  const part = (await wrap(<CountdownRing seconds={3} total={5} />)).getByTestId("countdownring-progress");
  expect(dashLen(part)).toBeCloseTo(C * 0.6, 1);

  const zero = (await wrap(<CountdownRing seconds={0} total={5} />)).getByTestId("countdownring-progress");
  expect(dashLen(zero)).toBeCloseTo(0, 1);
});

test("reduce motion: ring is static (arc identical to normal render)", async () => {
  const spy = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  const reduced = (await wrap(<CountdownRing seconds={3} total={5} />)).getByTestId("countdownring-progress");
  spy.mockResolvedValue(false);
  const normal = (await wrap(<CountdownRing seconds={3} total={5} />)).getByTestId("countdownring-progress");
  expect(dashLen(reduced)).toBeCloseTo(dashLen(normal), 5);
  spy.mockRestore();
});
