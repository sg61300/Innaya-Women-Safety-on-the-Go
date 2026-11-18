import { render, fireEvent } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { Button3D } from "../components/Button3D";
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: "light" } }));
// render()/rerender flush asynchronously in this project (React 19 / concurrent);
// findByRole awaits the commit so the disabled prop is applied before we press
// (see Text.test.tsx / language.test.tsx for the async-render convention).
const wrap = (ui: React.ReactElement) => render(<ThemeProvider initial="violetBloom">{ui}</ThemeProvider>);
test("fires onPress, not when disabled, and exposes a11y role", async () => {
  const onPress = jest.fn();
  const { findByRole, rerender, unmount } = await wrap(<Button3D label="Start" onPress={onPress} />);
  await fireEvent.press(await findByRole("button")); expect(onPress).toHaveBeenCalledTimes(1);
  rerender(<ThemeProvider initial="violetBloom"><Button3D label="Start" onPress={onPress} disabled /></ThemeProvider>);
  await fireEvent.press(await findByRole("button")); expect(onPress).toHaveBeenCalledTimes(1);
  unmount(); // RNTL auto-cleanup does not tear down a rerendered concurrent root; do it explicitly so the next test's tree is not blanked.
});
test("is a flat pill: 52 dp tall, radius 26", async () => {
  const { findByRole } = await wrap(<Button3D label="Go" onPress={() => {}} />);
  expect((await findByRole("button")).props.style).toEqual(expect.arrayContaining([expect.objectContaining({ minHeight: 52, borderRadius: 26 })]));
});
// s25 direction A: flat pill — the former "3-D" edge (a full-size `deep` pill
// behind the face, testID `${id}-base`) is a hard offset shadow the founder ruled
// out. It must never render, enabled or disabled.
test("renders no hard-shadow 3-D base layer (flat pill), any state", async () => {
  const { queryByTestId, findByRole, rerender } = await wrap(<Button3D label="Go" onPress={() => {}} testID="b" />);
  await findByRole("button");
  expect(queryByTestId("b-base")).toBeNull();
  rerender(<ThemeProvider initial="violetBloom"><Button3D label="Go" onPress={() => {}} testID="b" disabled /></ThemeProvider>);
  await findByRole("button");
  expect(queryByTestId("b-base")).toBeNull();
});
// Disabled is a solid face at 45% opacity (not a dead gradient): the outer wrapper
// carries opacity 0.45 and the Pressable keeps its solid backgroundColor.
test("disabled state is a solid face at 45% opacity", async () => {
  const { findByTestId, findByRole } = await wrap(<Button3D label="Go" onPress={() => {}} disabled testID="d" />);
  const btn = await findByRole("button");
  const wrapStyle = (await findByTestId("d-wrap")).props.style as { opacity?: number };
  expect(wrapStyle.opacity).toBe(0.45); // 45% opacity on the wrapper
  const faces = (Array.isArray(btn.props.style) ? (btn.props.style as unknown[]).flat(Infinity) : [btn.props.style])
    .filter(Boolean) as Array<{ backgroundColor?: string }>;
  const bg = faces.map((x) => x.backgroundColor).find(Boolean);
  expect(bg).toBeTruthy();               // solid face colour, not a gradient/transparent
  expect(String(bg).toLowerCase()).not.toBe("transparent");
});

// s25: the SOS red (#DC2626) is reserved for the danger variant only — the same
// role the circular SOS on Home fills. A primary CTA in the same tree must not
// paint that red. (Reliable component-level form of the "SOS is the only red on
// Home" guard; a full Home render is skipped under the low-RAM run constraint.)
test("only the danger variant paints the SOS red; the primary CTA does not", async () => {
  const { findByTestId } = await wrap(
    <>
      <Button3D label="SOS" variant="danger" onPress={() => {}} testID="sos" />
      <Button3D label="Start" variant="primary" onPress={() => {}} testID="cta" />
    </>,
  );
  const flat = (st: unknown) => (Array.isArray(st) ? (st as unknown[]).flat(Infinity) : [st]).filter(Boolean) as Array<{ backgroundColor?: string }>;
  const bg = async (id: string) => flat((await findByTestId(id)).props.style).map((x) => x.backgroundColor).filter(Boolean).map((c) => String(c).toUpperCase());
  expect(await bg("sos")).toContain("#DC2626");
  expect(await bg("cta")).not.toContain("#DC2626");
});
