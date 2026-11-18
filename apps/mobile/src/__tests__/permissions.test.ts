// Native permission modules are mocked so the pure ordering/gating logic and the
// requestStep/summary wiring can run under jsdom without a native build. jest
// hoists jest.mock above the ES imports, so the factories must read the mock
// objects lazily (at call time) — reading them at factory-eval time would find
// them still uninitialised. Same lazy pattern as language.test.tsx.
const mockAudio = { requestRecordingPermissionsAsync: jest.fn(), getRecordingPermissionsAsync: jest.fn() };
const mockLocation = {
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(),
};
const mockCamera = { requestCameraPermissionsAsync: jest.fn(), getCameraPermissionsAsync: jest.fn() };
const mockNotifications = { requestPermissionsAsync: jest.fn(), getPermissionsAsync: jest.fn() };
const mockStartActivity = jest.fn((..._a: unknown[]) => Promise.resolve());

jest.mock("expo-audio", () => ({
  AudioModule: {
    requestRecordingPermissionsAsync: (...a: unknown[]) => mockAudio.requestRecordingPermissionsAsync(...a),
    getRecordingPermissionsAsync: (...a: unknown[]) => mockAudio.getRecordingPermissionsAsync(...a),
  },
}));
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: (...a: unknown[]) => mockLocation.requestForegroundPermissionsAsync(...a),
  requestBackgroundPermissionsAsync: (...a: unknown[]) => mockLocation.requestBackgroundPermissionsAsync(...a),
  getForegroundPermissionsAsync: (...a: unknown[]) => mockLocation.getForegroundPermissionsAsync(...a),
  getBackgroundPermissionsAsync: (...a: unknown[]) => mockLocation.getBackgroundPermissionsAsync(...a),
}));
jest.mock("expo-camera", () => ({
  Camera: {
    requestCameraPermissionsAsync: (...a: unknown[]) => mockCamera.requestCameraPermissionsAsync(...a),
    getCameraPermissionsAsync: (...a: unknown[]) => mockCamera.getCameraPermissionsAsync(...a),
  },
}));
jest.mock("expo-notifications", () => ({
  requestPermissionsAsync: (...a: unknown[]) => mockNotifications.requestPermissionsAsync(...a),
  getPermissionsAsync: (...a: unknown[]) => mockNotifications.getPermissionsAsync(...a),
}));
jest.mock("expo-intent-launcher", () => ({
  startActivityAsync: (...a: unknown[]) => mockStartActivity(...a),
  ActivityAction: { IGNORE_BATTERY_OPTIMIZATION_SETTINGS: "battery-intent" },
}));

import { canStartJourney, PERMISSION_STEPS, requestStep, permissionsSummary, ensureJourneyPermissions } from "../lib/permissions";

beforeEach(() => jest.clearAllMocks());

// F18 (b16): arm-time permission flow.
const grant = (v: boolean, ask = true) => ({ granted: v, canAskAgain: ask, status: v ? "granted" : "denied" });

describe("F18 ensureJourneyPermissions", () => {
  const allGetDenied = () => {
    mockLocation.getForegroundPermissionsAsync.mockResolvedValue(grant(false));
    mockAudio.getRecordingPermissionsAsync.mockResolvedValue(grant(false));
    mockCamera.getCameraPermissionsAsync.mockResolvedValue(grant(false));
    mockNotifications.getPermissionsAsync.mockResolvedValue(grant(false));
  };

  test("all already granted: nothing is requested, nothing blocked", async () => {
    mockLocation.getForegroundPermissionsAsync.mockResolvedValue(grant(true));
    mockAudio.getRecordingPermissionsAsync.mockResolvedValue(grant(true));
    mockCamera.getCameraPermissionsAsync.mockResolvedValue(grant(true));
    mockNotifications.getPermissionsAsync.mockResolvedValue(grant(true));
    const { granted, blocked } = await ensureJourneyPermissions();
    expect(blocked).toEqual([]);
    expect(granted).toEqual({ location: true, mic: true, camera: true, notifications: true });
    expect(mockLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockAudio.requestRecordingPermissionsAsync).not.toHaveBeenCalled();
  });

  test("ask-again then granted: prompts and ends granted, nothing blocked", async () => {
    allGetDenied();
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue(grant(true));
    mockLocation.requestBackgroundPermissionsAsync.mockResolvedValue(grant(true));
    mockAudio.requestRecordingPermissionsAsync.mockResolvedValue(grant(true));
    mockCamera.requestCameraPermissionsAsync.mockResolvedValue(grant(true));
    mockNotifications.requestPermissionsAsync.mockResolvedValue(grant(true));
    const { granted, blocked } = await ensureJourneyPermissions();
    expect(mockLocation.requestForegroundPermissionsAsync).toHaveBeenCalled();
    expect(mockAudio.requestRecordingPermissionsAsync).toHaveBeenCalled();
    expect(blocked).toEqual([]);
    expect(granted.location).toBe(true);
    expect(granted.mic).toBe(true);
  });

  test("permanently denied essential: no prompt, reported as blocked", async () => {
    // location already denied and cannot ask again; mic ask-again then granted.
    mockLocation.getForegroundPermissionsAsync.mockResolvedValue(grant(false, false));
    mockAudio.getRecordingPermissionsAsync.mockResolvedValue(grant(false, true));
    mockAudio.requestRecordingPermissionsAsync.mockResolvedValue(grant(true));
    mockCamera.getCameraPermissionsAsync.mockResolvedValue(grant(true));
    mockNotifications.getPermissionsAsync.mockResolvedValue(grant(true));
    const { blocked } = await ensureJourneyPermissions();
    expect(mockLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled(); // never prompt when a prompt is impossible
    expect(blocked).toEqual(["location"]);
  });
});

test("order and journey gating", () => {
  expect(PERMISSION_STEPS.map((s) => s.key)).toEqual(["mic", "location", "camera", "notifications", "battery"]);
  expect(canStartJourney({ mic: true, location: true, camera: false, notifications: false, battery: false })).toBe(true);
  expect(canStartJourney({ mic: false, location: true, camera: true, notifications: true, battery: true })).toBe(false);
  expect(canStartJourney({ mic: true, location: false, camera: true, notifications: true, battery: true })).toBe(false);
});

test("requestStep(mic) maps granted", async () => {
  mockAudio.requestRecordingPermissionsAsync.mockResolvedValue({ granted: true });
  expect(await requestStep("mic")).toBe("granted");
  mockAudio.requestRecordingPermissionsAsync.mockResolvedValue({ granted: false });
  expect(await requestStep("mic")).toBe("denied");
});

test("requestStep(location) needs both foreground and background", async () => {
  mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false });
  expect(await requestStep("location")).toBe("denied");
  expect(mockLocation.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();

  mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  mockLocation.requestBackgroundPermissionsAsync.mockResolvedValue({ granted: true });
  expect(await requestStep("location")).toBe("granted");
});

test("requestStep(battery) opens the settings intent and always resolves granted", async () => {
  expect(await requestStep("battery")).toBe("granted");
  expect(mockStartActivity).toHaveBeenCalledWith("battery-intent");
});

test("permissionsSummary reads each getter; battery is always true", async () => {
  mockAudio.getRecordingPermissionsAsync.mockResolvedValue({ granted: true });
  mockLocation.getBackgroundPermissionsAsync.mockResolvedValue({ granted: false });
  mockCamera.getCameraPermissionsAsync.mockResolvedValue({ granted: true });
  mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false });
  expect(await permissionsSummary()).toEqual({ mic: true, location: false, camera: true, notifications: false, battery: true });
});
