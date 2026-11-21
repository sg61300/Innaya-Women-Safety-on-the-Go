// Lane E3 / X5a — CancelFlow's simulation mode: shows the self-email notice on the
// proof step, emails the tester their own proof, ends on the "sent" screen, and
// NEVER opens a guardian cancel request. The real (non-sim) flow is unchanged.
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
type Utils = Awaited<ReturnType<typeof mount>>;
const setText = (el: Utils, id: string, t: string) => act(async () => fireEvent.changeText(el.getByTestId(id), t));
const press = (el: Utils, id: string) => act(async () => fireEvent.press(el.getByTestId(id)));

function makeDeps(over: Partial<CancelFlowDeps> = {}): CancelFlowDeps {
  return {
    verifyPassword: jest.fn().mockResolvedValue(true),
    verifyWord: jest.fn().mockResolvedValue(true),
    createRequest: jest.fn().mockResolvedValue({ askedCount: 3 }),
    uploadMedia: jest.fn().mockResolvedValue("me@example.com"),
    captureMedia: { takePhoto: jest.fn().mockResolvedValue("file:///p.jpg"), recordVideo: jest.fn().mockResolvedValue("file:///p.mp4") },
    ...over,
  };
}

describe("CancelFlow simulation mode", () => {
  it("shows the self-email notice on the proof step, then the sent screen — and NEVER calls createRequest", async () => {
    const createRequest = jest.fn();
    const uploadMedia = jest.fn().mockResolvedValue("me@example.com");
    const onExit = jest.fn();
    // No journey → password step goes straight to the media proof step.
    const el = await mount(
      <CancelFlow hasJourney={false} deps={makeDeps({ createRequest, uploadMedia })} onExit={onExit} simulation={{ email: "me@example.com" }} />,
    );
    await setText(el, "cancel-password-input", "pw");
    await press(el, "cancel-password-submit");
    // notice on the proof step names the tester's own email
    expect(el.getByTestId("cancel-sim-notice").props.children).toBe(i18n.t("cancelFlow.simNotice", { email: "me@example.com" }));
    // capture the proof (default mode = photo)
    await press(el, "cancel-media-capture");
    // landed on the sent screen with the success line
    el.getByTestId("cancel-step-sent");
    expect(el.getByTestId("cancel-sim-sent").props.children).toBe(i18n.t("cancelFlow.simSent", { email: "me@example.com" }));
    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(createRequest).not.toHaveBeenCalled(); // no guardian request from a drill
    // "Done" ends the drill via the existing exit affordance
    await press(el, "cancel-sim-done");
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("real (non-simulation) flow is unchanged: proof → guardian request", async () => {
    const createRequest = jest.fn().mockResolvedValue({ askedCount: 2 });
    const el = await mount(
      <CancelFlow hasJourney={false} deps={makeDeps({ createRequest })} onExit={jest.fn()} />,
    );
    await setText(el, "cancel-password-input", "pw");
    await press(el, "cancel-password-submit");
    el.getByTestId("cancel-step-media");
    expect(el.queryByTestId("cancel-sim-notice")).toBeNull();
    await press(el, "cancel-media-capture");
    expect(el.queryByTestId("cancel-step-media")).toBeNull();
    expect(createRequest).toHaveBeenCalledTimes(1);
  });
});
