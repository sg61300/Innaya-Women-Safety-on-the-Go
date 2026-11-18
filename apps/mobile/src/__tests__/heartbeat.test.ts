// Task 24 — buildHeartbeat marks battery_low strictly under 10 %. Importing
// location.ts registers the background task at module load, so expo-task-manager
// is mocked to a no-op defineTask (the real one needs a native runtime).
jest.mock("expo-task-manager", () => ({ defineTask: jest.fn() }));
// location.ts constructs the Supabase client at import; stub it (no env in jest,
// same pattern as events.test.ts). buildHeartbeat itself touches none of this.
jest.mock("../lib/supabase", () => ({ supabase: { from: () => ({ insert: jest.fn(), update: () => ({ eq: jest.fn() }) }) } }));
// location.ts imports the Task 25 listener (audio.ts), which loads native engines
// at module load. Stub them so this pure-function test never touches a native
// registry (the engines are exercised in ringBuffer.test.ts).
const sub = () => ({ remove: jest.fn() });
jest.mock("react-native-vosk", () => ({
  loadModel: jest.fn(async () => {}),
  unload: jest.fn(),
  start: jest.fn(async () => {}),
  stop: jest.fn(),
  onResult: jest.fn(sub),
  onPartialResult: jest.fn(sub),
  onError: jest.fn(sub),
  onTimeout: jest.fn(sub),
}));
jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: { start: jest.fn(), stop: jest.fn(), abort: jest.fn(), addListener: jest.fn(sub) },
}));
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  getInfoAsync: jest.fn(async () => ({ exists: true, isDirectory: true })),
  makeDirectoryAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: "file:///doc/x" })),
}));

import { buildHeartbeat } from "../services/location";

test("heartbeat marks battery_low under 10 %", () => {
  expect(buildHeartbeat("j1", 0.09, { mic: true, cam: false, gps: true, ble: false })).toEqual({
    journey_id: "j1",
    battery: 0.09,
    battery_low: true,
    sensors: { mic: true, cam: false, gps: true, ble: false },
  });
  expect(buildHeartbeat("j1", 0.5, { mic: true, cam: true, gps: true, ble: false }).battery_low).toBe(false);
});

test("battery_low boundary is strict: exactly 10 % is not low", () => {
  expect(buildHeartbeat("j1", 0.1, { mic: false, cam: false, gps: true, ble: false }).battery_low).toBe(false);
  expect(buildHeartbeat("j1", 0.099, { mic: false, cam: false, gps: true, ble: false }).battery_low).toBe(true);
});
