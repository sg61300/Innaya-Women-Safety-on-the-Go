import { render, fireEvent, act } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";

// The runner is mocked: the modal must only render + call mockResolve, and
// must never escalate on its own (the runner owns all timers).
const mockResolve = jest.fn();
const mockSend = jest.fn();
jest.mock("../services/protocolRunner", () => ({
  runner: { resolveChallenge: (...a: unknown[]) => mockResolve(...a), send: (...a: unknown[]) => mockSend(...a) },
}));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined), // Button3D fires this on press-in
  NotificationFeedbackType: { Error: "error" },
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
}));
jest.mock("expo-camera", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return { CameraView: (p: any) => React2.createElement(View, { testID: p.testID }) };
});
// events.ts imports the supabase client at module load (needs env we don't set
// in tests); stub it — the modal only uses events.log for the best-effort selfie.
jest.mock("../lib/events", () => ({ events: { log: jest.fn().mockResolvedValue(undefined) } }));

import { AreYouSafeModal, challengeSelfiePath } from "../components/AreYouSafeModal";
import { useJourney, type Challenge } from "../store/journey";
import { initialContext } from "@vaira/core";

const challenge = (over: Partial<Challenge> = {}): Challenge => ({
  kind: "check",
  deadline: Date.now() + 5000,
  reason: "test",
  ending: false,
  speakerPrompt: true,
  typedOnly: false,
  secondary: false,
  ...over,
});

const setChallenge = (c: Challenge | null, ctx: Partial<ReturnType<typeof initialContext>> = {}) =>
  useJourney.getState().set({ challenge: c, ctx: { ...initialContext(), ...ctx }, journey: { id: "j1" } });

const mount = async () => {
  const utils = await render(
    <ThemeProvider>
      <AreYouSafeModal />
    </ThemeProvider>
  );
  await act(async () => {});
  return utils;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockResolve.mockResolvedValue(true);
  setChallenge(null);
});
afterEach(() => setChallenge(null));

test("nothing renders when there is no open challenge", async () => {
  const { queryByTestId } = await mount();
  expect(queryByTestId("areyousafe-modal")).toBeNull();
});

test("plain check kind renders AreYouSafeLayout; typed submit resolves with the text", async () => {
  setChallenge(challenge({ kind: "check" }));
  const { getByTestId } = await mount();
  expect(getByTestId("areyousafe-layout")).toBeTruthy();
  await act(async () => fireEvent.changeText(getByTestId("areyousafe-input"), "purple kettle"));
  await act(async () => fireEvent.press(getByTestId("areyousafe-confirm")));
  expect(mockResolve).toHaveBeenCalledWith("purple kettle");
});

test("an invalid journey word shows feedback and keeps the challenge open", async () => {
  mockResolve.mockResolvedValue(false);
  setChallenge(challenge({ kind: "arrival", deadline: Date.now() + 300000 }));
  const { getByTestId } = await mount();
  await act(async () => fireEvent.changeText(getByTestId("areyousafe-input"), "old journey word"));
  await act(async () => fireEvent.press(getByTestId("areyousafe-confirm")));
  expect(getByTestId("areyousafe-error")).toBeTruthy();
  expect(getByTestId("areyousafe-modal")).toBeTruthy();
});

test("danger button resolves with 'danger', never 'safe'", async () => {
  setChallenge(challenge({ kind: "check" }));
  const { getByTestId } = await mount();
  await act(async () => fireEvent.press(getByTestId("areyousafe-danger")));
  expect(mockResolve).toHaveBeenCalledWith("danger");
  expect(mockResolve).not.toHaveBeenCalledWith("safe");
});

// D16: the modal is NOT keyed to the safe-word check only — a route-deviation
// challenge must render the same visible ARE-YOU-SAFE layout.
test("route kind renders the visible ARE-YOU-SAFE layout (not keyed to safe-word only)", async () => {
  setChallenge(challenge({ kind: "route" }));
  const { getByTestId } = await mount();
  expect(getByTestId("areyousafe-modal")).toBeTruthy();
  expect(getByTestId("areyousafe-layout")).toBeTruthy();
  await act(async () => fireEvent.changeText(getByTestId("areyousafe-input"), "purple kettle"));
  await act(async () => fireEvent.press(getByTestId("areyousafe-confirm")));
  expect(mockResolve).toHaveBeenCalledWith("purple kettle");
});

test("away kind shows the secondary button which resolves with 'secondary'", async () => {
  setChallenge(challenge({ kind: "away", secondary: true }));
  const { getByTestId } = await mount();
  await act(async () => fireEvent.press(getByTestId("areyousafe-secondary")));
  expect(mockResolve).toHaveBeenCalledWith("secondary");
});

test("pause kind: masked input, no speaker prompt line, silent (no haptic)", async () => {
  const Haptics = require("expo-haptics");
  setChallenge(challenge({ kind: "pause", speakerPrompt: false, typedOnly: true, deadline: Date.now() + 5000 }));
  const { getByTestId, queryByText } = await mount();
  expect(getByTestId("areyousafe-input").props.secureTextEntry).toBe(true);
  // The 3 s "Listening…" line is driven by speakerPrompt, which is false here.
  expect(queryByText(/Listening/i)).toBeNull();
  expect(Haptics.notificationAsync).not.toHaveBeenCalled();
});

test("pause while the camera is already off shows only the Camera off copy", async () => {
  setChallenge(challenge({ kind: "pause", speakerPrompt: false, typedOnly: true }), { cameraPaused: true });
  const { getByTestId, queryByTestId } = await mount();
  expect(getByTestId("areyousafe-cameraoff")).toBeTruthy();
  expect(queryByTestId("areyousafe-input")).toBeNull();
});

test("arrival kind renders its own title", async () => {
  setChallenge(challenge({ kind: "arrival", speakerPrompt: false, deadline: Date.now() + 300000 }));
  const { getByText } = await mount();
  expect(getByText(/Looks like you have arrived/i)).toBeTruthy();
});

test("non-pause kinds fire the heavy haptic triple on open", async () => {
  const Haptics = require("expo-haptics");
  setChallenge(challenge({ kind: "check" }));
  await mount();
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(3);
});

test("the countdown reaching 0 never calls runner.send (the runner owns escalation)", async () => {
  jest.useFakeTimers();
  setChallenge(challenge({ kind: "check", deadline: Date.now() + 300 }));
  render(
    <ThemeProvider>
      <AreYouSafeModal />
    </ThemeProvider>
  );
  await act(async () => {
    jest.advanceTimersByTime(2000); // well past the 0.3 s deadline
  });
  expect(mockSend).not.toHaveBeenCalled();
  jest.useRealTimers();
});

test("challenge selfie path starts with the OWNER id folder (selfies_owner_insert policy) and is bucket-relative", () => {
  const path = challengeSelfiePath("u1", "j1", 1700000000000);
  expect(path).toBe("u1/challenge-j1-1700000000000.jpg");
  expect(path.startsWith("selfies/")).toBe(false);
});
