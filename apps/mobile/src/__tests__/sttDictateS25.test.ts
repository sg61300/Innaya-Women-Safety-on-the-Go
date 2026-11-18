// s25 X6 guard: the shared mic helper maps EVERY outcome to a caller-visible
// result — permission denied, empty/no speech, and an unavailable service — so
// the mic button is never silently dead (the Samsung "mic does nothing" report).
const mockRequest = jest.fn();
const mockListen = jest.fn();
jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: { requestPermissionsAsync: (...a: unknown[]) => mockRequest(...a) },
}));
jest.mock("../services/stt", () => ({ stt: { listenOnce: (...a: unknown[]) => mockListen(...a) } }));

import { dictateOnce } from "../services/sttDictate";

beforeEach(() => jest.clearAllMocks());

test("permission denied → permission error, never listens", async () => {
  mockRequest.mockResolvedValue({ granted: false });
  const r = await dictateOnce();
  expect(r.text).toBeUndefined();
  expect(r.kind).toBe("permission");
  expect(r.error).toBeTruthy();
  expect(mockListen).not.toHaveBeenCalled();
});

test("granted + transcript → trimmed text, no error", async () => {
  mockRequest.mockResolvedValue({ granted: true });
  mockListen.mockResolvedValue("  iamsafe  ");
  const r = await dictateOnce();
  expect(r.text).toBe("iamsafe");
  expect(r.error).toBeUndefined();
});

test("granted + empty transcript → noSpeech error", async () => {
  mockRequest.mockResolvedValue({ granted: true });
  mockListen.mockResolvedValue("   ");
  const r = await dictateOnce();
  expect(r.kind).toBe("noSpeech");
  expect(r.error).toBeTruthy();
});

test("service throws → unavailable error (not a crash)", async () => {
  mockRequest.mockResolvedValue({ granted: true });
  mockListen.mockRejectedValue(new Error("no recognition service"));
  const r = await dictateOnce();
  expect(r.kind).toBe("unavailable");
  expect(r.error).toBeTruthy();
});

test("timeout → noSpeech error", async () => {
  mockRequest.mockResolvedValue({ granted: true });
  mockListen.mockRejectedValue(new Error("timeout"));
  const r = await dictateOnce();
  expect(r.kind).toBe("noSpeech");
});
