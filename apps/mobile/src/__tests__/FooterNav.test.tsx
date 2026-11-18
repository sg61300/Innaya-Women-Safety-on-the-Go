import { render, fireEvent, act } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
// FooterNav wraps its SOS slot in a <TourTarget> (Task 22), which needs a
// TourProvider ancestor; the provider reads expo-router's useRouter, so both are
// supplied here.
jest.mock("expo-router", () => ({ useRouter: () => ({ navigate: jest.fn() }) }));
import { FooterNav } from "../components/FooterNav";
import { TourProvider } from "../components/tour/TourProvider";
import i18n from "../i18n";
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: "l", Heavy: "h" } }));
const navigate = jest.fn();
const emit = jest.fn(() => ({ defaultPrevented: false }));
const props: any = { state: { index: 0, routes: [{ key: "h", name: "home" }, { key: "r", name: "regions" }, { key: "s", name: "sos" }, { key: "m", name: "simulate" }, { key: "p", name: "profile" }] }, navigation: { navigate, emit }, descriptors: {}, insets: { bottom: 0 } };
beforeEach(() => { navigate.mockClear(); emit.mockClear(); });
afterEach(() => jest.useRealTimers());
// render() resolves asynchronously in this project (React 19 / concurrent) — await it.
test("user footer has 5 slots and navigates", async () => {
  const { getByText, getByTestId } = await render(<ThemeProvider initial="midnight"><TourProvider><FooterNav {...props} role="user" onSos={() => {}} /></TourProvider></ThemeProvider>);
  for (const l of ["Home", "Regions", "Simulate", "Profile"]) getByText(l);
  getByTestId("sos");
  fireEvent.press(getByText("Regions")); expect(navigate).toHaveBeenCalledWith("regions");
});

// role=user: pressing the already-active tab (Home, state.index 0) must not
// navigate. RED if the `!active` guard in onPress is removed: navigate fires.
test("user footer does not navigate on the active tab", async () => {
  const { getByTestId } = await render(<ThemeProvider initial="midnight"><TourProvider><FooterNav {...props} role="user" onSos={() => {}} /></TourProvider></ThemeProvider>);
  fireEvent.press(getByTestId("tab-home"));
  expect(navigate).not.toHaveBeenCalled();
});

test("user footer resets a deep Profile route to the card list", async () => {
  const profileState = { ...props, state: { ...props.state, index: 4 } };
  const { getByTestId } = await render(<ThemeProvider initial="midnight"><TourProvider><FooterNav {...profileState} role="user" onSos={() => {}} /></TourProvider></ThemeProvider>);
  fireEvent.press(getByTestId("tab-profile"));
  expect(navigate).toHaveBeenCalledWith("profile", { screen: "index" });
});

// role=guardian, navigation state carrying only "trustees": live and vitals are
// absent routes, so they render disabled with their hint, and pressing them must
// not navigate. RED if the `if (!present) return;` guard is removed: the press
// emits tabPress and navigate fires for the absent route.
const guardianState: any = { state: { index: 0, routes: [{ key: "t", name: "trustees" }] }, navigation: { navigate, emit }, descriptors: {}, insets: { bottom: 0 } };
test("guardian footer disables absent slots with a hint and blocks their nav", async () => {
  const { getByTestId } = await render(<ThemeProvider initial="midnight"><TourProvider><FooterNav {...guardianState} role="guardian" onSos={() => {}} /></TourProvider></ThemeProvider>);
  for (const key of ["live", "vitals"]) {
    const el = getByTestId(`tab-${key}`);
    expect(el.props.accessibilityState.disabled).toBe(true);
    expect(el.props.accessibilityHint).toBeTruthy();
    fireEvent.press(el);
  }
  expect(navigate).not.toHaveBeenCalled();
});

// role=guardian: the centre SOS slot's hold button calls onSos after a full
// 1 s hold. RED if HoldSosButton's onTrigger is not wired to onSos.
test("guardian SOS slot fires onSos on a full hold", async () => {
  const onSos = jest.fn();
  const { getByTestId } = await render(<ThemeProvider initial="midnight"><TourProvider><FooterNav {...guardianState} role="guardian" onSos={onSos} /></TourProvider></ThemeProvider>);
  jest.useFakeTimers();
  await act(async () => { fireEvent(getByTestId("sos"), "pressIn"); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(onSos).toHaveBeenCalledTimes(1);
});
