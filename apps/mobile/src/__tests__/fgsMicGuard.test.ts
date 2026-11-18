// J1 (b12, Android 14+): the expo-location foreground service is declared
// foregroundServiceType="location|microphone" (R35 keyword listener). Android 14
// verifies RECORD_AUDIO at startForeground time and throws a native
// SecurityException — JS safe() cannot catch it and the app dies. location.start()
// must therefore refuse to start the service when RECORD_AUDIO is not granted:
// no startLocationUpdatesAsync, a logged "fg_service blocked" event, gps=false and
// a blockedReason the UI can read — and it must never throw.
//
// The location.ts dependency chain (audio → vosk, feeds, protocolRunner) pulls no
// crypto; the heavy native engines are mocked the same way locationTask.test.ts
// does so the module registers without a native build.
const mockLog = jest.fn((..._a: any[]) => Promise.resolve());
jest.mock("../lib/events", () => ({ events: { log: (...a: any[]) => mockLog(...a) } }));
jest.mock("expo-task-manager", () => ({ defineTask: jest.fn() }));
jest.mock("../lib/supabase", () => ({ supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }), update: () => ({ eq: () => Promise.resolve({ error: null }) }) }) } }));
jest.mock("expo-battery", () => ({ getBatteryLevelAsync: jest.fn(async () => 1) }));
const mockStart = jest.fn((..._a: any[]) => Promise.resolve());
jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  startLocationUpdatesAsync: (...a: any[]) => mockStart(...a),
  stopLocationUpdatesAsync: jest.fn(async () => {}),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
}));
jest.mock("expo-keep-awake", () => ({ activateKeepAwakeAsync: jest.fn(async () => {}), deactivateKeepAwake: jest.fn() }));
const sub = () => ({ remove: jest.fn() });
jest.mock("react-native-vosk", () => ({ loadModel: jest.fn(async () => {}), unload: jest.fn(), start: jest.fn(async () => {}), stop: jest.fn(), onResult: jest.fn(sub), onPartialResult: jest.fn(sub), onError: jest.fn(sub), onTimeout: jest.fn(sub) }));
jest.mock("expo-speech-recognition", () => ({ ExpoSpeechRecognitionModule: { start: jest.fn(), stop: jest.fn(), abort: jest.fn(), addListener: jest.fn(sub) } }));
jest.mock("expo-file-system/legacy", () => ({ documentDirectory: "file:///doc/", getInfoAsync: jest.fn(async () => ({ exists: true, isDirectory: true })), makeDirectoryAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: "file:///doc/x" })), readDirectoryAsync: jest.fn(async () => ["conf"]), moveAsync: jest.fn(async () => {}) }));

import { PermissionsAndroid, Platform, AppState } from "react-native";
import { location } from "../services/location";
import { useJourney } from "../store/journey";

// Drive the Android FGS path regardless of the host jest-expo default (ios).
Object.defineProperty(Platform, "OS", { get: () => "android", configurable: true });

beforeEach(() => {
  mockStart.mockClear();
  mockLog.mockClear();
  (AppState as any).currentState = "active";
  useJourney.getState().set({ journey: { id: "j1" }, sensors: { mic: false, cam: false, gps: false, ble: false } });
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("RED→GREEN: RECORD_AUDIO denied (and re-request fails) → NO service start, logs fg_service blocked, gps=false, blockedReason set, no throw", async () => {
  jest.spyOn(PermissionsAndroid, "check").mockResolvedValue(false);
  jest.spyOn(PermissionsAndroid, "request").mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);

  await expect(location.start()).resolves.toBeUndefined();

  expect(mockStart).not.toHaveBeenCalled();
  expect(mockLog).toHaveBeenCalledWith("fg_service", { state: "blocked", reason: "mic_permission" }, "j1");
  expect(useJourney.getState().sensors.gps).toBe(false);
  expect((useJourney.getState() as any).blockedReason).toBe("mic_permission");
});

test("RECORD_AUDIO already granted → service starts as before, gps=true, blockedReason cleared", async () => {
  useJourney.getState().set({ blockedReason: "mic_permission" } as any);
  jest.spyOn(PermissionsAndroid, "check").mockResolvedValue(true);

  await location.start();

  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(useJourney.getState().sensors.gps).toBe(true);
  expect((useJourney.getState() as any).blockedReason).toBeNull();
});

test("denied while backgrounded → does NOT request (no foreground prompt), still blocked", async () => {
  (AppState as any).currentState = "background";
  const check = jest.spyOn(PermissionsAndroid, "check").mockResolvedValue(false);
  const request = jest.spyOn(PermissionsAndroid, "request").mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);

  await location.start();

  expect(check).toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  expect(mockStart).not.toHaveBeenCalled();
});
