// Task 19 (ADR-034) — stt.listenOnce on expo-speech-recognition: one final
// result resolves; an error event or the timeout rejects; and every path tears
// down its listeners + stops recognition so nothing leaks between calls.
const mockListeners: Record<string, (e: unknown) => void> = {};
const mockRemove = jest.fn();
const mockStart = jest.fn();
const mockStop = jest.fn();
jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    addListener: (name: string, cb: (e: unknown) => void) => {
      mockListeners[name] = cb;
      return { remove: mockRemove };
    },
    start: (...a: unknown[]) => mockStart(...a),
    stop: (...a: unknown[]) => mockStop(...a),
  },
}));

import { stt } from "../services/stt";

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockListeners)) delete mockListeners[k];
});

test("resolves with the first final transcript and stops + removes listeners", async () => {
  const promise = stt.listenOnce();
  expect(mockStart).toHaveBeenCalledWith({ lang: "en-IN", interimResults: false });
  mockListeners.result({ isFinal: false, results: [{ transcript: "partial" }] });
  mockListeners.result({ isFinal: true, results: [{ transcript: "blue mango" }] });
  await expect(promise).resolves.toBe("blue mango");
  expect(mockStop).toHaveBeenCalled();
  expect(mockRemove).toHaveBeenCalledTimes(2);
});

test("rejects on an error event", async () => {
  const promise = stt.listenOnce();
  mockListeners.error({ error: "no-speech", message: "No speech detected" });
  await expect(promise).rejects.toThrow("No speech detected");
  expect(mockStop).toHaveBeenCalled();
});

test("rejects on timeout", async () => {
  jest.useFakeTimers();
  const promise = stt.listenOnce(8000);
  const assertion = expect(promise).rejects.toThrow("timeout");
  jest.advanceTimersByTime(8000);
  await assertion;
  jest.useRealTimers();
});

test("a late result after settling does not double-resolve or re-stop", async () => {
  const promise = stt.listenOnce();
  mockListeners.result({ isFinal: true, results: [{ transcript: "first" }] });
  await expect(promise).resolves.toBe("first");
  expect(mockStop).toHaveBeenCalledTimes(1);
  mockListeners.result({ isFinal: true, results: [{ transcript: "second" }] });
  expect(mockStop).toHaveBeenCalledTimes(1);
});
