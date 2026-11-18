// D12 (b5): the monitoring camera must mount once, at the app layout, whenever a
// journey is armed/active and the camera is not paused — never only on the hidden
// journey/active screen. These tests pin the mount gate.
jest.mock("../services/camera", () => ({ camera: { attach: jest.fn() } }));
jest.mock("expo-camera", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return { CameraView: (p: any) => React2.createElement(View, { testID: p.testID }) };
});

import { render, act } from "@testing-library/react-native";
import { ActiveJourneyCamera, shouldMountCamera } from "../components/HiddenCamera";
import { useJourney } from "../store/journey";
import { initialContext, type ProtocolState } from "@vaira/core";

const setState = (over: {
  journey?: unknown;
  state?: ProtocolState;
  cameraPaused?: boolean;
}) =>
  useJourney.getState().set({
    journey: "journey" in over ? (over.journey as any) : { id: "j1" },
    ctx: { ...initialContext(), state: over.state ?? "SAFE", cameraPaused: over.cameraPaused ?? false },
  });

const mount = async () => {
  const utils = render(<ActiveJourneyCamera />);
  await act(async () => {});
  return utils;
};

beforeEach(() => {
  jest.clearAllMocks();
  useJourney.getState().reset();
});
afterEach(() => useJourney.getState().reset());

test("shouldMountCamera: only with an active journey that is not paused", () => {
  expect(shouldMountCamera("SAFE", { id: "j1" }, false)).toBe(true);
  expect(shouldMountCamera("AMBER", { id: "j1" }, false)).toBe(true);
  expect(shouldMountCamera("CRITICAL", { id: "j1" }, false)).toBe(true);
  expect(shouldMountCamera("ARMED", { id: "j1" }, false)).toBe(true);
  // no journey, ended, idle, or paused → no camera
  expect(shouldMountCamera("SAFE", null, false)).toBe(false);
  expect(shouldMountCamera("IDLE", { id: "j1" }, false)).toBe(false);
  expect(shouldMountCamera("RESOLVED", { id: "j1" }, false)).toBe(false);
  expect(shouldMountCamera("SAFE", { id: "j1" }, true)).toBe(false);
});

test("renders the hidden camera while a journey is active", async () => {
  setState({ state: "SAFE" });
  const { queryByTestId } = await mount();
  expect(queryByTestId("hidden-camera")).toBeTruthy();
});

test("renders nothing when there is no active journey", async () => {
  setState({ journey: null, state: "IDLE" });
  const { queryByTestId } = await mount();
  expect(queryByTestId("hidden-camera")).toBeNull();
});

test("hides the camera while it is paused (ADR-038 verified pause)", async () => {
  setState({ state: "SAFE", cameraPaused: true });
  const { queryByTestId } = await mount();
  expect(queryByTestId("hidden-camera")).toBeNull();
});
