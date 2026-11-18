import { render, act, fireEvent, waitFor } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";

// F7: control camera-permission state per test.
let mockPerm: { granted: boolean; canAskAgain: boolean } | null = { granted: false, canAskAgain: true };
const mockRequest = jest.fn().mockResolvedValue({ granted: true });
jest.mock("expo-camera", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    CameraView: (p: { testID?: string }) => React.createElement(View, { testID: p.testID }),
    useCameraPermissions: () => [mockPerm, mockRequest],
  };
});

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
jest.mock("../services/protocolRunner", () => ({ runner: { send: jest.fn(), resolveChallenge: jest.fn() } }));
// ADR-043 rule 10: the exit now uses the APP password (gates.verifyPassword),
// not the retired emergency password.
const mockVerifyPassword = jest.fn();
jest.mock("../services/gates", () => ({ gates: { verifyPassword: (...a: unknown[]) => mockVerifyPassword(...a) } }));
jest.mock("../services/appPassword", () => ({ resolveAccountEmail: jest.fn().mockResolvedValue("user@example.com") }));

import { FakeLiveStream } from "../components/FakeLiveStream";

const wrap = (visible: boolean, onClose: () => void = () => {}) => render(<ThemeProvider initial="midnight"><FakeLiveStream visible={visible} onClose={onClose} /></ThemeProvider>);

beforeEach(() => { jest.clearAllMocks(); mockPerm = { granted: false, canAskAgain: true }; });

test("F7: requests the camera on open and hides the preview until granted", async () => {
  const { queryByTestId } = await wrap(true);
  await act(async () => {});
  expect(mockRequest).toHaveBeenCalled();
  expect(queryByTestId("fakelive-camera")).toBeNull(); // black-frame fallback
});

test("F7: renders the front camera preview once permission is granted", async () => {
  mockPerm = { granted: true, canAskAgain: false };
  const { getByTestId } = await wrap(true);
  await act(async () => {});
  getByTestId("fakelive-camera");
});

test("F13: the exit input and button stay mounted together in the gate", async () => {
  mockPerm = { granted: true, canAskAgain: false };
  const { getByTestId } = await wrap(true);
  await act(async () => {});
  getByTestId("fakelive-exit-input");
  getByTestId("fakelive-exit-btn");
});

test("simulation exit rejects a wrong app password", async () => {
  mockPerm = { granted: true, canAskAgain: false };
  mockVerifyPassword.mockResolvedValue({ ok: false, reason: "wrong" });
  const onClose = jest.fn();
  const { getByTestId } = await wrap(true, onClose);
  await act(async () => {});
  await act(async () => { fireEvent.changeText(getByTestId("fakelive-exit-input"), "wrong"); });
  await act(async () => { fireEvent.press(getByTestId("fakelive-exit-btn")); await Promise.resolve(); });
  expect(mockVerifyPassword).toHaveBeenCalledWith("user@example.com", "wrong");
  getByTestId("fakelive-exit-error");
  expect(onClose).not.toHaveBeenCalled();
});

test("simulation exit accepts the app password", async () => {
  mockPerm = { granted: true, canAskAgain: false };
  mockVerifyPassword.mockResolvedValue({ ok: true });
  const onClose = jest.fn();
  const { getByTestId } = await wrap(true, onClose);
  await act(async () => {});
  await act(async () => { fireEvent.changeText(getByTestId("fakelive-exit-input"), "my-app-password"); });
  await act(async () => { fireEvent.press(getByTestId("fakelive-exit-btn")); await Promise.resolve(); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
  expect(mockVerifyPassword).toHaveBeenCalledWith("user@example.com", "my-app-password");
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});
