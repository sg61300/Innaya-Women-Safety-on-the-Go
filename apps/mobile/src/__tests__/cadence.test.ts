// Task 26: adaptive frame cadence, the masking gate, and upload retry/back-off.
import { camera, cadenceMs, uploadWithRetry } from "../services/camera";
import { setMasker, NoopMasker } from "../services/sensors/masker";
import { useJourney } from "../store/journey";

jest.mock("../lib/api", () => ({ post: jest.fn() }));
jest.mock("../lib/events", () => ({ events: { log: jest.fn(), flush: jest.fn().mockResolvedValue(undefined) } }));
const mockUpload = jest.fn();
jest.mock("../lib/supabase", () => ({
  supabase: { storage: { from: () => ({ upload: mockUpload }) } },
}));
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(async () => ({ uri: "file://small.jpg", width: 640, height: 480 })),
  SaveFormat: { JPEG: "jpeg" },
}));

import { post } from "../lib/api";

const okMasker = {
  maskFrame: jest.fn(async () => ({
    maskedUri: "data:image/jpeg;base64,AAAA",
    base64: "AAAA",
    plateText: "DL8CAB1234",
    counts: { facesTotal: 1, facesFull: 1, facesEyes: 0, textBoxes: 0 },
    degraded: false,
  })),
};

const fakeRef = () => ({ takePictureAsync: jest.fn(async () => ({ uri: "file://p.jpg" })) }) as any;

beforeEach(() => {
  jest.useRealTimers();
  mockUpload.mockReset();
  mockUpload.mockResolvedValue({ error: null });
  (post as jest.Mock).mockReset();
  (post as jest.Mock).mockResolvedValue({ score: 1 });
  okMasker.maskFrame.mockClear();
  (globalThis as any).fetch = jest.fn(async () => ({ blob: async () => ({}) }));
  useJourney.getState().reset();
  useJourney.getState().set({ sensors: { mic: false, cam: false, gps: false, ble: false } });
  camera.attach(null);
});

afterEach(() => {
  camera.stop();
  jest.useRealTimers();
});

test("approved policy: 5 min in SAFE, 1 min in every other active state", () => {
  expect(cadenceMs("SAFE")).toBe(300000);
  expect(cadenceMs("AMBER")).toBe(60000);
  expect(cadenceMs("EMERGENCY")).toBe(60000);
  expect(cadenceMs("CRITICAL")).toBe(60000);
});

test("lite mode does not create a separate camera cadence", () => {
  expect(cadenceMs("SAFE", true)).toBe(300000);
  expect(cadenceMs("RESOLVED_MONITORING", true)).toBe(60000);
  expect(cadenceMs("AMBER", true)).toBe(60000);
  expect(cadenceMs("EMERGENCY", true)).toBe(60000);
  expect(cadenceMs("CRITICAL", true)).toBe(60000);
  expect(cadenceMs("SAFE", false)).toBe(300000);
});

test("alarm elapsed time no longer changes the single policy", () => {
  expect(cadenceMs("AMBER", false, 0)).toBe(60000);
  expect(cadenceMs("AMBER", false, 30000)).toBe(60000);
  expect(cadenceMs("CRITICAL", false, 120000)).toBe(60000);
  expect(cadenceMs("SAFE", false, 999999)).toBe(300000);
  expect(cadenceMs("RESOLVED_MONITORING", false, 999999)).toBe(60000);
});

test("camera waits for the layout CameraView to attach after ARM", async () => {
  jest.useFakeTimers();
  setMasker(okMasker);
  useJourney.getState().set({ ctx: { state: "SAFE", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } });
  const onScore = jest.fn();

  camera.start("j1", onScore);
  await jest.advanceTimersByTimeAsync(250);
  expect(mockUpload).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();

  camera.attach(fakeRef());
  await jest.advanceTimersByTimeAsync(250);
  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledTimes(1);
  expect(onScore).toHaveBeenCalledWith({ score: 1 });
});

test("stopping a paused camera resets pause for the next journey", async () => {
  jest.useFakeTimers();
  setMasker(okMasker);
  useJourney.getState().set({ ctx: { state: "SAFE", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } });
  camera.setPaused(true);
  camera.stop();
  camera.attach(fakeRef());
  camera.start("j2", jest.fn());
  await jest.advanceTimersByTimeAsync(0);
  expect(mockUpload).toHaveBeenCalledTimes(1);
});

test("uploadWithRetry retries a transient failure then succeeds", async () => {
  mockUpload
    .mockResolvedValueOnce({ error: { message: "network" } })
    .mockResolvedValueOnce({ error: null });
  await uploadWithRetry("j1/1.jpg", {} as any, { baseMs: 1 });
  expect(mockUpload).toHaveBeenCalledTimes(2);
});

test("uploadWithRetry throws after exhausting attempts", async () => {
  mockUpload.mockResolvedValue({ error: { message: "network" } });
  await expect(uploadWithRetry("j1/1.jpg", {} as any, { attempts: 2, baseMs: 1 })).rejects.toThrow(
    /after 2 attempts/
  );
  expect(mockUpload).toHaveBeenCalledTimes(2);
});

test("uploadWithRetry does not retry a 4xx (non-transient) storage error (B5)", async () => {
  mockUpload.mockResolvedValue({ error: { statusCode: "403", message: "rls" } });
  await expect(uploadWithRetry("j1/1.jpg", {} as any, { baseMs: 1 })).rejects.toThrow();
  expect(mockUpload).toHaveBeenCalledTimes(1); // thrown immediately, no back-off
});

test("frame loop masks, uploads, analyzes, and adapts cadence on escalation", async () => {
  jest.useFakeTimers();
  setMasker(okMasker);
  useJourney.getState().set({ ctx: { state: "SAFE", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } });
  camera.attach(fakeRef());
  const setTimeoutSpy = jest.spyOn(globalThis, "setTimeout");
  const onScore = jest.fn();

  camera.start("j1", onScore);
  await jest.advanceTimersByTimeAsync(0); // let loop 1 finish and schedule loop 2

  expect(okMasker.maskFrame).toHaveBeenCalledTimes(1);
  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledTimes(1);
  expect(onScore).toHaveBeenCalledWith({ score: 1 });
  // /api/analyze receives the MASKED base64 and the plate text in context
  // /api/analyze must receive the ScoreInput shape the route consumes: masked
  // frame as a string (not frames[]), transcript30s, and plateText top-level.
  const body = (post as jest.Mock).mock.calls[0][1];
  expect(body.maskedFrameB64).toBe("AAAA");
  expect(body.transcript30s).toBe("");
  expect(body.plateText).toBe("DL8CAB1234");
  expect(body.state).toBe("SAFE");
  expect(body).not.toHaveProperty("frames");
  expect(body).not.toHaveProperty("transcript");
  expect(body).not.toHaveProperty("context");
  // SAFE -> next frame scheduled 5 min out
  expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 300000);

  // escalate to AMBER; next scheduled frame must be 1 min out
  useJourney.getState().set({ ctx: { state: "AMBER", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } });
  await jest.advanceTimersByTimeAsync(300000);
  expect(mockUpload).toHaveBeenCalledTimes(2);
  expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 60000);
});

test("stop() during an in-flight capture aborts the frame (B2)", async () => {
  jest.useFakeTimers();
  setMasker(okMasker);
  useJourney.getState().set({ ctx: { state: "AMBER", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } });
  let resolveCapture!: (v: unknown) => void;
  const ref = {
    takePictureAsync: jest.fn(() => new Promise((r) => { resolveCapture = r; })),
  } as any;
  camera.attach(ref);
  const onScore = jest.fn();

  camera.start("j1", onScore);
  await jest.advanceTimersByTimeAsync(0); // loop 1 starts, capture pending
  camera.stop();
  resolveCapture({ uri: "file://p.jpg" }); // capture resolves AFTER stop
  await jest.advanceTimersByTimeAsync(0);

  expect(mockUpload).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
  expect(onScore).not.toHaveBeenCalled();
  expect(useJourney.getState().sensors.cam).toBe(false);
});

test("a second start() does not spawn a second loop (B2)", async () => {
  jest.useFakeTimers();
  setMasker(okMasker);
  useJourney.getState().set({ ctx: { state: "AMBER", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } });
  const ref = fakeRef();
  camera.attach(ref);

  camera.start("j1", jest.fn());
  camera.start("j1", jest.fn());
  await jest.advanceTimersByTimeAsync(0);

  expect(ref.takePictureAsync).toHaveBeenCalledTimes(1); // one tick, one capture
});

test("a capture that never resolves times out after 8 s (B2)", async () => {
  jest.useFakeTimers();
  setMasker(okMasker);
  useJourney.getState().set({ ctx: { state: "AMBER", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } });
  const ref = { takePictureAsync: jest.fn(() => new Promise(() => {})) } as any; // never resolves
  camera.attach(ref);
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const setTimeoutSpy = jest.spyOn(globalThis, "setTimeout");

  camera.start("j1", jest.fn());
  await jest.advanceTimersByTimeAsync(8000);

  expect(warn).toHaveBeenCalledWith(expect.stringContaining("[frame] capture failed"));
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("timed out"));
  expect(useJourney.getState().sensors.cam).toBe(false);
  expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 60000); // next tick scheduled
  warn.mockRestore();
});

test("cam is not reported healthy before a frame succeeds (B6)", async () => {
  jest.useFakeTimers();
  setMasker(NoopMasker);
  useJourney.getState().set({ ctx: { state: "AMBER", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } });
  camera.attach(fakeRef());
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

  camera.start("j1", jest.fn());
  expect(useJourney.getState().sensors.cam).toBe(false); // not set true in start()
  await jest.advanceTimersByTimeAsync(0);
  expect(useJourney.getState().sensors.cam).toBe(false); // NoopMasker -> never healthy
  warn.mockRestore();
});

test("masking gate blocks upload when no masker is available (ADR-019/R36)", async () => {
  jest.useFakeTimers();
  setMasker(NoopMasker);
  useJourney.getState().set({ ctx: { state: "AMBER", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } });
  camera.attach(fakeRef());
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

  camera.start("j1", jest.fn());
  await jest.advanceTimersByTimeAsync(0);

  expect(mockUpload).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
  expect(useJourney.getState().sensors.cam).toBe(false); // sensor flagged degraded
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("[frame] mask failed"));
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("upload blocked"));
  warn.mockRestore();
});
