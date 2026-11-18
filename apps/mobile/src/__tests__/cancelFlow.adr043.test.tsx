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
type CancelVerdict = "cancel" | "keep" | "reraise" | "pending";

// The AreYouSafeModal.test pattern: mount with `await render` + an empty
// `await act`, and wrap EVERY interaction in `await act(async () => …)` so each
// async handler settles inside its own act scope (a floating async setState
// overlaps the next test's act and corrupts the renderer).
const mount = async (el: React.ReactElement) => {
  const utils = await render(<ThemeProvider>{el}</ThemeProvider>);
  await act(async () => {});
  return utils;
};

function makeDeps(over: Partial<CancelFlowDeps> = {}): { deps: CancelFlowDeps; emit: (v: CancelVerdict) => void; createRequest: jest.Mock; uploadMedia: jest.Mock } {
  let cb: ((v: CancelVerdict) => void) | null = null;
  const createRequest = jest.fn().mockResolvedValue({ askedCount: 3 });
  const uploadMedia = jest.fn().mockResolvedValue("cancel/j1/r1.jpg");
  const deps: CancelFlowDeps = {
    verifyPassword: jest.fn().mockResolvedValue(true),
    verifyWord: jest.fn().mockResolvedValue(true),
    createRequest,
    subscribeVerdict: jest.fn((c: (v: CancelVerdict) => void) => { cb = c; return () => { cb = null; }; }),
    uploadMedia,
    captureMedia: { takePhoto: jest.fn().mockResolvedValue("file:///tmp/proof.jpg"), recordVideo: jest.fn().mockResolvedValue("file:///tmp/proof.mp4") },
    ...over,
  };
  return { deps, emit: (v) => cb?.(v), createRequest: createRequest as jest.Mock, uploadMedia: uploadMedia as jest.Mock };
}

type Utils = Awaited<ReturnType<typeof mount>>;
const setText = (el: Utils, id: string, text: string) => act(async () => fireEvent.changeText(el.getByTestId(id), text));
const press = (el: Utils, id: string) => act(async () => fireEvent.press(el.getByTestId(id)));
const passPassword = async (el: Utils) => { await setText(el, "cancel-password-input", "pw"); await press(el, "cancel-password-submit"); };

it("password success with a journey advances to the word step", async () => {
  const { deps } = makeDeps();
  const el = await mount(<CancelFlow hasJourney deps={deps} onResolved={jest.fn()} />);
  await passPassword(el);
  expect(el.getByTestId("cancel-step-word")).toBeTruthy();
});

it("password success with NO journey skips to the media/proof step", async () => {
  const { deps } = makeDeps();
  const el = await mount(<CancelFlow hasJourney={false} deps={deps} onResolved={jest.fn()} />);
  await passPassword(el);
  expect(el.getByTestId("cancel-step-media")).toBeTruthy();
});

it("a wrong journey word keeps the word step and never opens a request", async () => {
  const { deps, createRequest } = makeDeps({ verifyWord: jest.fn().mockResolvedValue(false) });
  const el = await mount(<CancelFlow hasJourney deps={deps} onResolved={jest.fn()} />);
  await passPassword(el);
  await setText(el, "cancel-word-input", "wrong");
  await press(el, "cancel-word-submit");
  expect(el.getByTestId("cancel-error")).toBeTruthy();
  expect(el.getByTestId("cancel-step-word")).toBeTruthy();
  expect(createRequest).not.toHaveBeenCalled();
});

it("a correct word opens a word cancel request and waits, showing the asked count", async () => {
  const { deps, createRequest } = makeDeps();
  const el = await mount(<CancelFlow hasJourney deps={deps} onResolved={jest.fn()} />);
  await passPassword(el);
  await setText(el, "cancel-word-input", "bluebird");
  await press(el, "cancel-word-submit");
  expect(el.getByTestId("cancel-step-waiting")).toBeTruthy();
  expect(createRequest).toHaveBeenCalledWith("word");
  expect(el.getByTestId("cancel-wait-asked").props.children).toContain("3");
});

it("Forgot it jumps to the media step", async () => {
  const { deps } = makeDeps();
  const el = await mount(<CancelFlow hasJourney deps={deps} onResolved={jest.fn()} />);
  await passPassword(el);
  await press(el, "cancel-forgot");
  expect(el.getByTestId("cancel-step-media")).toBeTruthy();
});

it("a Safe verdict resolves the flow as cancelled", async () => {
  const onResolved = jest.fn();
  const { deps, emit } = makeDeps();
  const el = await mount(<CancelFlow hasJourney deps={deps} onResolved={onResolved} />);
  await passPassword(el);
  await setText(el, "cancel-word-input", "bluebird");
  await press(el, "cancel-word-submit");
  await act(async () => emit("cancel"));
  expect(el.getByTestId("cancel-step-cancelled")).toBeTruthy();
  expect(onResolved).toHaveBeenCalledWith("cancel");
});

it("a reraise verdict resolves the flow as reraise and shows the kept-on notice", async () => {
  const onResolved = jest.fn();
  const { deps, emit } = makeDeps();
  const el = await mount(<CancelFlow hasJourney deps={deps} onResolved={onResolved} />);
  await passPassword(el);
  await setText(el, "cancel-word-input", "bluebird");
  await press(el, "cancel-word-submit");
  await act(async () => emit("reraise"));
  expect(el.getByTestId("cancel-step-reraised")).toBeTruthy();
  expect(onResolved).toHaveBeenCalledWith("reraise");
});

it("an upload failure at step 4 shows an error and NEVER creates the request", async () => {
  const { deps, createRequest } = makeDeps({ uploadMedia: jest.fn().mockRejectedValue(new Error("offline")) });
  const el = await mount(<CancelFlow hasJourney={false} deps={deps} onResolved={jest.fn()} />);
  await passPassword(el);
  await press(el, "cancel-media-capture"); // photo mode default
  expect(el.getByTestId("cancel-error")).toBeTruthy();
  expect(createRequest).not.toHaveBeenCalled();
  expect(el.getByTestId("cancel-step-media")).toBeTruthy();
});

it("a successful photo uploads then opens a photo request with the media path", async () => {
  const { deps, createRequest, uploadMedia } = makeDeps();
  const el = await mount(<CancelFlow hasJourney={false} deps={deps} onResolved={jest.fn()} />);
  await passPassword(el);
  await press(el, "cancel-media-capture");
  expect(el.getByTestId("cancel-step-waiting")).toBeTruthy();
  expect(uploadMedia).toHaveBeenCalled();
  expect(createRequest).toHaveBeenCalledWith("photo", "cancel/j1/r1.jpg");
});

it("two wrong passwords lock the third attempt (a locked press is ignored)", async () => {
  const { deps } = makeDeps({ verifyPassword: jest.fn().mockResolvedValue(false) });
  const el = await mount(<CancelFlow hasJourney deps={deps} onResolved={jest.fn()} />);
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
  const el = await mount(<CancelFlow hasJourney deps={deps} onResolved={jest.fn()} onSirenResume={onSirenResume} />);
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
  const el = await mount(<CancelFlow hasJourney deps={deps} onResolved={jest.fn()} />);
  await passPassword(el);
  await setText(el, "cancel-word-input", "bluebird");
  await press(el, "cancel-word-submit");
  expect(el.getByTestId("cancel-error").props.children).toBe("The alarm is not active any more.");
  expect(el.getByTestId("cancel-step-word")).toBeTruthy(); // did not advance to waiting
});

it("offline at step 2: createRequest rejects → error shown, stays on the word step", async () => {
  const { deps } = makeDeps({ createRequest: jest.fn().mockRejectedValue(new Error("Network request failed")) });
  const el = await mount(<CancelFlow hasJourney deps={deps} onResolved={jest.fn()} />);
  await passPassword(el);
  await setText(el, "cancel-word-input", "bluebird");
  await press(el, "cancel-word-submit");
  expect(el.getByTestId("cancel-error")).toBeTruthy();
  expect(el.getByTestId("cancel-step-word")).toBeTruthy();
});

it("a majority 'keep' verdict resolves the flow as reraise (alarm kept on)", async () => {
  const onResolved = jest.fn();
  const { deps, emit } = makeDeps();
  const el = await mount(<CancelFlow hasJourney deps={deps} onResolved={onResolved} />);
  await passPassword(el);
  await setText(el, "cancel-word-input", "bluebird");
  await press(el, "cancel-word-submit");
  await act(async () => emit("keep"));
  expect(el.getByTestId("cancel-step-reraised")).toBeTruthy();
  expect(onResolved).toHaveBeenCalledWith("reraise");
});
