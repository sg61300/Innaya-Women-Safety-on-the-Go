// ADR-043 — EmergencyOverlay: EMERGENCY keeps the are-you-safe word step; a
// SIREN-mode CRITICAL/CANCEL_HOLD shows the red layout + 10 s siren countdown +
// "Not an emergency" → the guardian CancelFlow; SILENT mode hides the overlay
// (SilentAlarmOverlay owns the calm screen). The runner owns the siren.
import { render, fireEvent, act } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { initialContext } from "@vaira/core";

const mockSend = jest.fn().mockResolvedValue(undefined);
const mockResolve = jest.fn().mockResolvedValue(true);
const mockHold = jest.fn();
jest.mock("../services/protocolRunner", () => ({
  runner: {
    send: (...a: unknown[]) => mockSend(...a),
    resolveChallenge: (...a: unknown[]) => mockResolve(...a),
    holdSirenForCancel: (...a: unknown[]) => mockHold(...a),
    resumeSirenAfterCancel: jest.fn(),
    isPractice: () => false,
  },
}));

// CancelFlow's real deps reach Supabase/gates; stub the factory so the flow renders.
const mockDeps = {
  verifyPassword: jest.fn().mockResolvedValue(true),
  verifyWord: jest.fn().mockResolvedValue(true),
  createRequest: jest.fn().mockResolvedValue({ askedCount: 3 }),
  uploadMedia: jest.fn(),
};
jest.mock("../services/cancelFlowDeps", () => ({ makeCancelFlowDeps: () => mockDeps }));
// X5a: EmergencyOverlay now also imports the simulation deps (real ones reach the
// API/Supabase); stub the factory so the module graph does not load Supabase here.
jest.mock("../services/simulationCancelFlowDeps", () => ({ makeSimulationCancelFlowDeps: () => mockDeps }));
jest.mock("expo-camera", () => ({ CameraView: () => null }));

import { EmergencyOverlay } from "../components/EmergencyOverlay";
import { useJourney } from "../store/journey";

const setState = (state: string, alarmMode: "siren" | "silent" = "siren") =>
  useJourney.getState().set({ ctx: { ...initialContext(), state, alarmMode } as ReturnType<typeof initialContext>, journey: { id: "j1" }, challenge: null });

const mount = async () => {
  const utils = await render(
    <ThemeProvider initial="violetBloom">
      <EmergencyOverlay />
    </ThemeProvider>,
  );
  await act(async () => {});
  return utils;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockResolve.mockResolvedValue(true);
  useJourney.getState().set({ ctx: initialContext(), journey: { id: "j1" }, challenge: null });
});

test("hidden when state is SAFE", async () => {
  setState("SAFE");
  const { queryByTestId } = await mount();
  expect(queryByTestId("emergency-overlay")).toBeNull();
});

test("siren-mode CRITICAL: visible with the siren countdown ring + 'Not an emergency'", async () => {
  setState("CRITICAL", "siren");
  const { getByTestId } = await mount();
  expect(getByTestId("emergency-overlay").props.visible).toBe(true);
  expect(getByTestId("siren-countdown")).toBeTruthy();
  expect(getByTestId("emergency-cancel")).toBeTruthy();
});

test("silent-mode CRITICAL: overlay hidden (SilentAlarmOverlay owns the screen)", async () => {
  setState("CRITICAL", "silent");
  const { queryByTestId } = await mount();
  expect(queryByTestId("emergency-overlay")).toBeNull();
});

test("CRITICAL 'Not an emergency' holds the siren and opens the CancelFlow (app password step)", async () => {
  setState("CRITICAL", "siren");
  const { getByTestId, queryByTestId } = await mount();
  expect(queryByTestId("cancel-step-password")).toBeNull();
  await act(async () => fireEvent.press(getByTestId("emergency-cancel")));
  expect(mockHold).toHaveBeenCalledTimes(1);
  expect(getByTestId("cancel-step-password")).toBeTruthy();
});

test("EMERGENCY + matching safe word → resolveChallenge(word,false) + accepted line", async () => {
  setState("EMERGENCY");
  const { getByTestId } = await mount();
  await act(async () => fireEvent.press(getByTestId("emergency-cancel")));
  await act(async () => fireEvent.changeText(getByTestId("overlay-safeword"), "blue mango"));
  await act(async () => fireEvent.press(getByTestId("overlay-submit")));
  expect(mockResolve).toHaveBeenCalledWith("blue mango", false);
  expect(getByTestId("overlay-accepted")).toBeTruthy();
});

test("EMERGENCY + non-matching safe word → Not recognised, no accept", async () => {
  mockResolve.mockResolvedValue(false);
  setState("EMERGENCY");
  const { getByTestId, getByText, queryByTestId } = await mount();
  await act(async () => fireEvent.press(getByTestId("emergency-cancel")));
  await act(async () => fireEvent.changeText(getByTestId("overlay-safeword"), "wrong"));
  await act(async () => fireEvent.press(getByTestId("overlay-submit")));
  getByText("Not recognised.");
  expect(queryByTestId("overlay-accepted")).toBeNull();
});

test("hardware back (onRequestClose) does nothing — stays visible", async () => {
  setState("CRITICAL", "siren");
  const { getByTestId } = await mount();
  await act(async () => getByTestId("emergency-overlay").props.onRequestClose());
  expect(getByTestId("emergency-overlay").props.visible).toBe(true);
});

test("hidden in EMERGENCY while a challenge is open; shows once it resolves", async () => {
  setState("EMERGENCY");
  useJourney.getState().set({ challenge: { kind: "check", reason: "t", ending: false, deadline: Date.now() + 5000, speakerPrompt: true, typedOnly: false, secondary: false } as never });
  const { queryByTestId, getByTestId } = await mount();
  expect(queryByTestId("emergency-overlay")).toBeNull();
  await act(async () => { useJourney.getState().set({ challenge: null }); });
  expect(getByTestId("emergency-overlay").props.visible).toBe(true);
});
