// Task 24 review (W3-A). The background task callback must survive a rejected
// battery read: importing location.ts registers the task, so we capture the
// callback from a stubbed defineTask and drive it directly. Native engines pulled
// in via audio.ts are mocked (same set as heartbeat.test.ts).
let mockTaskCb: (arg: any) => Promise<void>;
jest.mock("expo-task-manager", () => ({
  defineTask: (_name: string, cb: any) => {
    mockTaskCb = cb;
  },
}));
const mockInserts: Record<string, any[]> = {};
const mockUpdates: any[] = [];
jest.mock("../lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (row: any) => {
        (mockInserts[table] ??= []).push(row);
        return Promise.resolve({ error: null });
      },
      update: (row: any) => {
        mockUpdates.push(row);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  },
}));
jest.mock("expo-battery", () => ({
  getBatteryLevelAsync: jest.fn(() => Promise.reject(new Error("no battery"))),
}));
jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  startLocationUpdatesAsync: jest.fn(async () => {}),
  stopLocationUpdatesAsync: jest.fn(async () => {}),
  hasStartedLocationUpdatesAsync: jest.fn(() => Promise.reject(new Error("has-started boom"))),
}));
jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: jest.fn(async () => {}),
  deactivateKeepAwake: jest.fn(),
}));
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
  readDirectoryAsync: jest.fn(async () => ["conf"]),
  moveAsync: jest.fn(async () => {}),
}));

import { location } from "../services/location";
import { useJourney } from "../store/journey";
import { deactivateKeepAwake } from "expo-keep-awake";

const fakeLoc = { coords: { latitude: 12.9, longitude: 77.6, accuracy: 5, speed: 1.2 } };

test("A3: a rejected battery read still writes the location row and a null-battery heartbeat", async () => {
  for (const k of Object.keys(mockInserts)) delete mockInserts[k];
  mockUpdates.length = 0;
  useJourney.getState().set({
    journey: { id: "j1", owner_id: "o1" },
    sensors: { mic: false, cam: false, gps: false, ble: false },
  });

  await mockTaskCb({ data: { locations: [fakeLoc] } });

  expect(mockInserts.locations).toHaveLength(1);
  expect(mockInserts.heartbeats).toHaveLength(1);
  expect(mockInserts.heartbeats[0].battery).toBeNull();
  expect(mockInserts.heartbeats[0].battery_low).toBe(false);
  expect(mockUpdates).toHaveLength(1); // owner_id present → profiles update runs
});

// A4: a throw from hasStartedLocationUpdatesAsync must not leak the wake lock or
// the gps sensor flag — both are released in a finally.
test("A4: stop() releases keep-awake and clears gps even when hasStarted rejects", async () => {
  useJourney.getState().set({ sensors: { mic: false, cam: false, gps: true, ble: false } });
  await location.stop();
  expect(deactivateKeepAwake).toHaveBeenCalledWith("journey");
  expect(useJourney.getState().sensors.gps).toBe(false);
});
