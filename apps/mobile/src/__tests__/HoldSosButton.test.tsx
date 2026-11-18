import { render, fireEvent, act } from "@testing-library/react-native";
import { HoldSosButton } from "../components/HoldSosButton";
import i18n from "../i18n";

// expo-haptics is a native module (no-op under jest); react-native-svg and
// lucide use the project-wide mocks from jest.setup.ts, and reanimated is mocked
// there too so the progress ring's shared value never touches React state.
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: "l", Heavy: "h" } }));

// Isolate the unit from the theme system. The real ThemeProvider reads the saved
// palette via an async AsyncStorage effect; this unit test stubs useTheme with a
// static palette instead — Text and HoldSosButton both read it here. Colour
// wiring is covered by the component-kit tests that use the real provider.
jest.mock("../theme", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({
    p: { text: "#1A1024", textMuted: "#6B5B7A", textFaint: "#9A8AA8" },
    d: { sos: "#DC2626", sosDeep: "#991B1B", onPrimary: "#FFFFFF" },
  }),
}));

// render() + fireEvent settle cleanly only under REAL timers here (async
// concurrent root — see the note in Button3D.test.tsx / FooterNav.test.tsx).
// Enabling fake timers at module scope makes render's internal act overlap the
// hold-advance act and blanks every later render, so each test mounts under real
// timers and switches to fake timers only to drive the setTimeout to the ms.
afterEach(() => jest.useRealTimers());

test("fires only after a full 1 s hold", async () => {
  const onTrigger = jest.fn();
  const { getByTestId } = await render(<HoldSosButton onTrigger={onTrigger} />);
  jest.useFakeTimers();
  await act(async () => { fireEvent(getByTestId("sos"), "pressIn"); });
  await act(async () => { jest.advanceTimersByTime(999); });
  expect(onTrigger).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(onTrigger).toHaveBeenCalledTimes(1);
});

test("release before 1 s cancels", async () => {
  const onTrigger = jest.fn();
  const { getByTestId } = await render(<HoldSosButton onTrigger={onTrigger} />);
  jest.useFakeTimers();
  await act(async () => { fireEvent(getByTestId("sos"), "pressIn"); });
  await act(async () => { jest.advanceTimersByTime(500); });
  await act(async () => { fireEvent(getByTestId("sos"), "pressOut"); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(onTrigger).not.toHaveBeenCalled();
});

test("unmount mid-hold cancels the pending trigger", async () => {
  const onTrigger = jest.fn();
  const { getByTestId, unmount } = await render(<HoldSosButton onTrigger={onTrigger} />);
  jest.useFakeTimers();
  await act(async () => { fireEvent(getByTestId("sos"), "pressIn"); });
  await act(async () => { jest.advanceTimersByTime(500); });
  await act(async () => { unmount(); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(onTrigger).not.toHaveBeenCalled();
});

test("a11y label says hold", async () => {
  const { getByLabelText } = await render(<HoldSosButton onTrigger={() => {}} />);
  getByLabelText(i18n.t("sos.a11yHold"));
});
