// s25 X5b (exit affordance) + X5c (network vs wrong password) guards for CancelFlow.
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
import i18n from "../i18n";

const mount = async (el: React.ReactElement) => {
  const utils = await render(<ThemeProvider>{el}</ThemeProvider>);
  await act(async () => {});
  return utils;
};

function makeDeps(over: Partial<CancelFlowDeps> = {}): CancelFlowDeps {
  return {
    verifyPassword: jest.fn().mockResolvedValue(true),
    verifyWord: jest.fn().mockResolvedValue(true),
    createRequest: jest.fn().mockResolvedValue({ askedCount: 3 }),
    uploadMedia: jest.fn().mockResolvedValue("cancel/j1/r1.jpg"),
    captureMedia: { takePhoto: jest.fn().mockResolvedValue("file:///p.jpg"), recordVideo: jest.fn().mockResolvedValue("file:///p.mp4") },
    ...over,
  };
}
type Utils = Awaited<ReturnType<typeof mount>>;
const setText = (el: Utils, id: string, t: string) => act(async () => fireEvent.changeText(el.getByTestId(id), t));
const press = (el: Utils, id: string) => act(async () => fireEvent.press(el.getByTestId(id)));

describe("X5b exit affordance", () => {
  it("shows a 'Back to alarm' control and calls onExit from the password step", async () => {
    const onExit = jest.fn();
    const el = await mount(<CancelFlow hasJourney deps={makeDeps()} onExit={onExit} />);
    await press(el, "cancel-exit");
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("keeps the exit control on the media/proof step (never a dead end)", async () => {
    const onExit = jest.fn();
    // No journey → password step goes straight to the media proof step.
    const el = await mount(<CancelFlow hasJourney={false} deps={makeDeps()} onExit={onExit} />);
    await setText(el, "cancel-password-input", "pw");
    await press(el, "cancel-password-submit");
    el.getByTestId("cancel-step-media");
    await press(el, "cancel-exit");
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("renders no exit control when onExit is not provided", async () => {
    const el = await mount(<CancelFlow hasJourney deps={makeDeps()} />);
    expect(el.queryByTestId("cancel-exit")).toBeNull();
  });
});

describe("X5c network vs wrong password", () => {
  it("a network failure shows the retry message and does NOT count a try or lock", async () => {
    const verifyPassword = jest.fn().mockResolvedValue({ ok: false, reason: "network" });
    const el = await mount(<CancelFlow hasJourney deps={makeDeps({ verifyPassword })} />);
    await setText(el, "cancel-password-input", "pw");
    await press(el, "cancel-password-submit");
    expect(el.getByTestId("cancel-error").props.children).toBe(i18n.t("cancelFlow.pwNetwork"));
    // still on the password step, submit still enabled (no 30 s lock)
    el.getByTestId("cancel-step-password");
    expect(el.getByTestId("cancel-password-submit").props.accessibilityState?.disabled).not.toBe(true);

    // second network failure also does not lock
    await setText(el, "cancel-password-input", "pw");
    await press(el, "cancel-password-submit");
    el.getByTestId("cancel-step-password");
    expect(el.getByTestId("cancel-password-submit").props.accessibilityState?.disabled).not.toBe(true);
    expect(verifyPassword).toHaveBeenCalledTimes(2);
  });

  it("a genuinely wrong password (boolean false) still counts toward the 2-try lock", async () => {
    const verifyPassword = jest.fn().mockResolvedValue(false);
    const el = await mount(<CancelFlow hasJourney deps={makeDeps({ verifyPassword })} />);
    await setText(el, "cancel-password-input", "x");
    await press(el, "cancel-password-submit");
    expect(el.getByTestId("cancel-error").props.children).toBe(i18n.t("cancelFlow.pwWrong", { n: 1 }));
    await setText(el, "cancel-password-input", "y");
    await press(el, "cancel-password-submit");
    // 2nd wrong → locked
    expect(el.getByTestId("cancel-password-submit").props.accessibilityState?.disabled).toBe(true);
  });
});
