// ADR-043 item 4 — the "Not an emergency" cancel flow state machine.
// expo-camera's native CameraView leaks async setState across renders under
// jest-expo (blanking later renders), so stub it as the other suites do.
jest.mock("expo-camera", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return {
    CameraView: React2.forwardRef((p: Record<string, unknown>, _r: unknown) => React2.createElement(View, { testID: p.testID })),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});
import { act, fireEvent, render } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { CancelFlow, type CancelFlowDeps } from "../components/CancelFlow";

// The AreYouSafeModal.test pattern: mount with `await render` + an empty
// `await act`, and wrap EVERY interaction in `await act(async () => …)` so each
// async handler settles inside its own act scope (a floating async setState
// overlaps the next test's act and corrupts the renderer).
const mount = async (el: React.ReactElement) => {
  const utils = await render(<ThemeProvider>{el}</ThemeProvider>);
  await act(async () => {});
  return utils;
};

function makeDeps(over: Partial<CancelFlowDeps> = {}): { deps: CancelFlowDeps; createRequest: jest.Mock; uploadMedia: jest.Mock } {
  const createRequest = jest.fn().mockResolvedValue({ askedCount: 3 });
  const uploadMedia = jest.fn().mockResolvedValue("cancel/j1/r1.jpg");
  const deps: CancelFlowDeps = {
    verifyPassword: jest.fn().mockResolvedValue(true),
    verifyWord: jest.fn().mockResolvedValue(true),
    createRequest,
    uploadMedia,
    captureMedia: { takePhoto: jest.fn().mockResolvedValue("file:///tmp/proof.jpg"), recordVideo: jest.fn().mockResolvedValue("file:///tmp/proof.mp4") },
    ...over,
  };
  return { deps, createRequest: createRequest as jest.Mock, uploadMedia: uploadMedia as jest.Mock };
}

type Utils = Awaited<ReturnType<typeof mount>>;
const setText = (el: Utils, id: string, text: string) => act(async () => fireEvent.changeText(el.getByTestId(id), text));
const press = (el: Utils, id: string) => act(async () => fireEvent.press(el.getByTestId(id)));
const passPassword = async (el: Utils) => { await setText(el, "cancel-password-input", "pw"); await press(el, "cancel-password-submit"); };

it("password success with a journey advances to the word step", async () => {
  const { deps } = makeDeps();
  const el = await mount(<CancelFlow hasJourney deps={deps} />);
  await passPassword(el);
  expect(el.getByTestId("cancel-step-word")).toBeTruthy();
});

it("password success with NO journey skips to the media/proof step", async () => {
  const { deps } = makeDeps();
  const el = await mount(<CancelFlow hasJourney={false} deps={deps} />);
  await passPassword(el);
  expect(el.getByTestId("cancel-step-media")).toBeTruthy();
});

it("a wrong journey word keeps the word step and never opens a request", async () => {
  const { deps, createRequest } = makeDeps({ verifyWord: jest.fn().mockResolvedValue(false) });
  const el = await mount(<CancelFlow hasJourney deps={deps} />);
  await passPassword(el);
  await setText(el, "cancel-word-input", "wrong");
  await press(el, "cancel-word-submit");
  expect(el.getByTestId("cancel-error")).toBeTruthy();
  expect(el.getByTestId("cancel-step-word")).toBeTruthy();
  expect(createRequest).not.toHaveBeenCalled();
});

it("a correct word opens a word cancel request and leaves the steps", async () => {
  const { deps, createRequest } = makeDeps();
  const el = await mount(<CancelFlow hasJourney deps={deps} />);
  await passPassword(el);
  await setText(el, "cancel-word-input", "bluebird");
  await press(el, "cancel-word-submit");
  expect(el.queryByTestId("cancel-step-word")).toBeNull();
  expect(createRequest).toHaveBeenCalledWith("word");
});

it("Forgot it jumps to the media step", async () => {
  const { deps } = makeDeps();
  const el = await mount(<CancelFlow hasJourney deps={deps} />);
  await passPassword(el);
  await press(el, "cancel-forgot");
  expect(el.getByTestId("cancel-step-media")).toBeTruthy();
});

it("an upload failure at step 4 shows an error and NEVER creates the request", async () => {
  const { deps, createRequest } = makeDeps({ uploadMedia: jest.fn().mockRejectedValue(new Error("offline")) });
  const el = await mount(<CancelFlow hasJourney={false} deps={deps} />);
  await passPassword(el);
  await press(el, "cancel-media-capture"); // photo mode default
  expect(el.getByTestId("cancel-error")).toBeTruthy();
  expect(createRequest).not.toHaveBeenCalled();
  expect(el.getByTestId("cancel-step-media")).toBeTruthy();
});

it("a successful photo uploads then opens a photo request with the media path", async () => {
  const { deps, createRequest, uploadMedia } = makeDeps();
  const el = await mount(<CancelFlow hasJourney={false} deps={deps} />);
  await passPassword(el);
  await press(el, "cancel-media-capture");
  expect(el.queryByTestId("cancel-step-media")).toBeNull();
  expect(uploadMedia).toHaveBeenCalled();
  expect(createRequest).toHaveBeenCalledWith("photo", "cancel/j1/r1.jpg");
});

it("two wrong passwords lock the third attempt (a locked press is ignored)", async () => {
  const { deps } = makeDeps({ verifyPassword: jest.fn().mockResolvedValue(false) });
  const el = await mount(<CancelFlow hasJourney deps={deps} />);
  await setText(el, "cancel-password-input", "x");
  await press(el, "cancel-password-submit");
  await setText(el, "cancel-password-input", "y");
  await press(el, "cancel-password-submit");
  expect(el.getByTestId("cancel-password-submit").props.accessibilityState?.disabled).toBe(true);
  await press(el, "cancel-password-submit"); // ignored while locked
  expect(deps.verifyPassword).toHaveBeenCalledTimes(2);
});

// ---- stress (ADR-043 item 5 / §9) ----

it("rule 5: the 2nd wrong password fires onSirenResume once (siren starts in Siren mode)", async () => {
  const onSirenResume = jest.fn();
  const { deps } = makeDeps({ verifyPassword: jest.fn().mockResolvedValue(false) });
  const el = await mount(<CancelFlow hasJourney deps={deps} onSirenResume={onSirenResume} />);
  await setText(el, "cancel-password-input", "x");
  await press(el, "cancel-password-submit");
  expect(onSirenResume).not.toHaveBeenCalled();
  await setText(el, "cancel-password-input", "y");
  await press(el, "cancel-password-submit");
  expect(onSirenResume).toHaveBeenCalledTimes(1);
});

it("409 (not cancellable) at step 2 shows 'the alarm is not active' and stays on the word step", async () => {
  const notCancellable = Object.assign(new Error("409"), { name: "NotCancellableError" });
  const { deps } = makeDeps({ createRequest: jest.fn().mockRejectedValue(notCancellable) });
  const el = await mount(<CancelFlow hasJourney deps={deps} />);
  await passPassword(el);
  await setText(el, "cancel-word-input", "bluebird");
  await press(el, "cancel-word-submit");
  expect(el.getByTestId("cancel-error").props.children).toBe("The alarm is not active any more.");
  expect(el.getByTestId("cancel-step-word")).toBeTruthy(); // did not advance to waiting
});

it("offline at step 2: createRequest rejects → error shown, stays on the word step", async () => {
  const { deps } = makeDeps({ createRequest: jest.fn().mockRejectedValue(new Error("Network request failed")) });
  const el = await mount(<CancelFlow hasJourney deps={deps} />);
  await passPassword(el);
  await setText(el, "cancel-word-input", "bluebird");
  await press(el, "cancel-word-submit");
  expect(el.getByTestId("cancel-error")).toBeTruthy();
  expect(el.getByTestId("cancel-step-word")).toBeTruthy();
});

// G1 (founder Q101, Q96 replaced): the correct word opens the request to the guardians and
// there is no countdown: the flow is done and her screen goes normal.
it("G1: correct word opens the guardian request, with no countdown and no waiting screen", async () => {
  const { deps, createRequest } = makeDeps();
  const el = await mount(<CancelFlow hasJourney deps={deps} />);
  await passPassword(el);
  await setText(el, "cancel-word-input", "word");
  await press(el, "cancel-word-submit");
  expect(createRequest).toHaveBeenCalledWith("word");
  expect(el.queryByTestId("cancel-wait-bar")).toBeNull();
  expect(el.queryByTestId("cancel-step-waiting")).toBeNull();
});

it("G8: a failed send on the word step never says the word was wrong", async () => {
  const { deps } = makeDeps({ createRequest: jest.fn().mockRejectedValue(new Error("/api/cancel-request 500")) });
  const el = await mount(<CancelFlow hasJourney deps={deps} />);
  await passPassword(el);
  await setText(el, "cancel-word-input", "word");
  await press(el, "cancel-word-submit");
  expect(el.getByTestId("cancel-error")).toHaveTextContent("Could not send your request. Please try again.");
});
