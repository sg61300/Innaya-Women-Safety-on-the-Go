import { render, act, fireEvent } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";

const mockSelect = jest.fn().mockResolvedValue(undefined);
jest.mock("../services/vitals", () => ({ vitals: { select: (...a: unknown[]) => mockSelect(...a) } }));
const mockSend = jest.fn();
jest.mock("../services/protocolRunner", () => ({ runner: { send: (...a: unknown[]) => mockSend(...a) } }));

import { VitalsTab } from "../components/VitalsTab";
import { useJourney } from "../store/journey";

const wrap = () => render(<ThemeProvider initial="midnight"><VitalsTab /></ThemeProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  useJourney.getState().set({ vitals: null, journey: null });
});

test("F14: selecting Demo scenarios reveals chips; a scenario animates the tiles and shows a label", async () => {
  jest.useFakeTimers();
  const { getByTestId } = await wrap();
  await act(async () => { fireEvent.press(getByTestId("vitals-source-simulated")); });
  getByTestId("vitals-demo-scenarios");
  await act(async () => { fireEvent.press(getByTestId("vitals-scenario-panic")); });
  const s = useJourney.getState().vitals!;
  expect(s.hr).toBeGreaterThanOrEqual(130);
  expect(s.spo2).not.toBeUndefined();
  getByTestId("vitals-demo-label");
  jest.useRealTimers();
});

test("F14: a Panic scenario during an armed journey raises a vitals stress score", async () => {
  jest.useFakeTimers();
  useJourney.getState().set({ journey: { id: "j1" } as never });
  const { getByTestId } = await wrap();
  await act(async () => { fireEvent.press(getByTestId("vitals-source-simulated")); });
  await act(async () => { fireEvent.press(getByTestId("vitals-scenario-panic")); });
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ type: "SCORE", reasons: ["vitals_stress"] }));
  jest.useRealTimers();
});

test("F9b/F9c: unavailable BLE and Health Connect sources are explicit and disabled", async () => {
  const { getByTestId } = await wrap();
  expect(getByTestId("vitals-source-ble").props.accessibilityState.disabled).toBe(true);
  expect(getByTestId("vitals-source-health_connect").props.accessibilityState.disabled).toBe(true);
});
