// Task 25. RingBuffer and the Kannada continuous-recognizer restart loop live in
// services/audio.ts, which imports native engines at module load — mock them so
// importing the pure helpers under jest never touches a TurboModule/native
// registry (same approach as stt.test.ts / events.test.ts).
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
jest.mock("../lib/supabase", () => ({ supabase: { from: () => ({ insert: jest.fn() }) } }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => "[]"),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import { RingBuffer, createContinuousRecognizer } from "../services/audio";

test("ring buffer keeps 30 s", () => {
  const rb = new RingBuffer(30_000);
  rb.push("a", 0);
  rb.push("b", 10_000);
  rb.push("c", 40_000);
  expect(rb.text(40_000)).toBe("b c");
});

test("items strictly older than the 30 s window are evicted", () => {
  const rb = new RingBuffer(30_000);
  rb.push("a", 0);
  rb.push("b", 9_999); // age 30_002 at query -> just outside
  rb.push("c", 40_001);
  expect(rb.text(40_001)).toBe("c");
});

// Kannada uses expo-speech-recognition continuous mode with an auto-restart loop
// (amendment). The loop restarts immediately on a normal end, restarts after a
// back-off on error, and stops for good once stop() is called.
test("continuous recognizer restarts on end, backs off on error, halts after stop", () => {
  jest.useFakeTimers();
  const start = jest.fn();
  const loop = createContinuousRecognizer({ start, backoffMs: 500 });
  loop.start();
  expect(start).toHaveBeenCalledTimes(1); // initial start
  loop.onEnd();
  expect(start).toHaveBeenCalledTimes(2); // immediate restart on clean end
  loop.onError();
  expect(start).toHaveBeenCalledTimes(2); // not yet — waiting the back-off
  jest.advanceTimersByTime(500);
  expect(start).toHaveBeenCalledTimes(3); // restarted after back-off
  loop.stop();
  loop.onEnd();
  loop.onError();
  jest.advanceTimersByTime(5000);
  expect(start).toHaveBeenCalledTimes(3); // no restarts after stop()
  jest.useRealTimers();
});
