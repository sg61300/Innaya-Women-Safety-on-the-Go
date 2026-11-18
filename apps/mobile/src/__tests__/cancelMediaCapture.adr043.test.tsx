// ADR-043 item 4, step 4 — photo/video proof capture.
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
import { CancelMediaCapture, VIDEO_MAX_SEC, type MediaCapture } from "../components/CancelMediaCapture";

const mount = async (el: React.ReactElement) => {
  const utils = await render(<ThemeProvider>{el}</ThemeProvider>);
  await act(async () => {});
  return utils;
};
type Utils = Awaited<ReturnType<typeof mount>>;
const press = (el: Utils, id: string) => act(async () => fireEvent.press(el.getByTestId(id)));

const capture = (): MediaCapture => ({
  takePhoto: jest.fn().mockResolvedValue("file:///p.jpg"),
  recordVideo: jest.fn().mockResolvedValue("file:///v.mp4"),
});

it("video clips are capped at 15 seconds", () => {
  expect(VIDEO_MAX_SEC).toBe(15);
});

it("default photo mode captures a photo and reports method 'photo'", async () => {
  const onCaptured = jest.fn();
  const cap = capture();
  const el = await mount(<CancelMediaCapture onCaptured={onCaptured} capture={cap} />);
  await press(el, "cancel-media-capture");
  expect(cap.takePhoto).toHaveBeenCalledTimes(1);
  expect(cap.recordVideo).not.toHaveBeenCalled();
  expect(onCaptured).toHaveBeenCalledWith("file:///p.jpg", "photo");
});

it("video mode records a clip and reports method 'video'", async () => {
  const onCaptured = jest.fn();
  const cap = capture();
  const el = await mount(<CancelMediaCapture onCaptured={onCaptured} capture={cap} />);
  await press(el, "cancel-media-mode-video");
  await press(el, "cancel-media-capture");
  expect(cap.recordVideo).toHaveBeenCalledTimes(1);
  expect(cap.takePhoto).not.toHaveBeenCalled();
  expect(onCaptured).toHaveBeenCalledWith("file:///v.mp4", "video");
});

it("a failed capture reports nothing (parent keeps the screen)", async () => {
  const onCaptured = jest.fn();
  const cap: MediaCapture = { takePhoto: jest.fn().mockRejectedValue(new Error("no cam")), recordVideo: jest.fn() };
  const el = await mount(<CancelMediaCapture onCaptured={onCaptured} capture={cap} />);
  await press(el, "cancel-media-capture");
  expect(onCaptured).not.toHaveBeenCalled();
});
