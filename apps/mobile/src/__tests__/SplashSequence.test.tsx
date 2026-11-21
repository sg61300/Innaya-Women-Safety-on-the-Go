import { render, act } from "@testing-library/react-native";

// Skia renders on a native canvas with no jsdom backing, so stub the Skia nodes
// used by the splash as pass-through Views and stub the runtime-effect factory.
// We assert the timing and the reduce-motion branch (testIDs + onDone), not the
// GPU warp composite - that is proved on the spec render and on device, not jest.
jest.mock("@shopify/react-native-skia", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Node = (p: any) => React.createElement(View, null, p.children ?? null);
  return {
    Canvas: Node, Image: Node, Mask: Node, Group: Node, Rect: Node, Fill: Node,
    Shader: Node, ImageShader: Node, LinearGradient: Node, Circle: Node, RadialGradient: Node,
    useImage: () => ({ width: 1, height: 1 }),
    vec: (x: number, y: number) => ({ x, y }),
    Skia: { RuntimeEffect: { Make: () => ({}) } },
  };
});

import { SplashSequence } from "../components/SplashSequence";

// render() is async in this project (RTL 14 / React 19 concurrent).
jest.useFakeTimers();

test("mounts the emblem warp splash and hands off at 2.0 s (motion)", async () => {
  const onDone = jest.fn();
  const { getByTestId } = await render(<SplashSequence onDone={onDone} />);
  expect(getByTestId("splash")).toBeTruthy();
  expect(getByTestId("splash-wordmark")).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(1999); });
  expect(onDone).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(onDone).toHaveBeenCalledTimes(1);
});

test("reduce motion shows the still + wordmark and finishes in 1.2 s", async () => {
  const onDone = jest.fn();
  const { getByTestId } = await render(<SplashSequence onDone={onDone} reduceMotion />);
  expect(getByTestId("splash-wordmark")).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(1199); });
  expect(onDone).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(onDone).toHaveBeenCalledTimes(1);
});
