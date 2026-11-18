// Fix lane D3-6: the camera loop keeps a masked frame when the network fails, only then.
jest.mock("../lib/api", () => ({ post: jest.fn(async () => ({ score: 1 })) }));
jest.mock("../lib/events", () => ({ events: { log: jest.fn(), flush: jest.fn().mockResolvedValue(undefined) } }));
const mockUpload = jest.fn();
jest.mock("../lib/supabase", () => ({ supabase: { storage: { from: () => ({ upload: mockUpload }) } } }));
jest.mock("expo-image-manipulator", () => ({ manipulateAsync: jest.fn(async () => ({ uri: "file://small.jpg", width: 640, height: 480 })) }));
const mockAdd = jest.fn().mockResolvedValue(undefined);
const mockDrain = jest.fn().mockResolvedValue(undefined);
jest.mock("../services/frameQueue", () => ({ frameQueue: { add: (...a: unknown[]) => mockAdd(...a), drain: () => mockDrain() } }));
import { setMasker } from "../services/sensors/masker";

const run = async (state = "CRITICAL") => {
  jest.useFakeTimers();
  const { camera } = require("../services/camera");
  const { useJourney } = require("../store/journey");
  setMasker({ maskFrame: jest.fn(async () => ({ maskedUri: "", base64: "QkFTRTY0", plateText: null, counts: { facesTotal: 1 }, degraded: false })) } as never);
  useJourney.getState().reset();
  useJourney.getState().set({ ctx: { state: state as never, ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } });
  camera.attach({ takePictureAsync: jest.fn(async () => ({ uri: "file://RAW.jpg" })) });
  camera.start("j1", jest.fn());
  await jest.advanceTimersByTimeAsync(2000);
  camera.stop();
  jest.useRealTimers();
};
beforeEach(() => { mockAdd.mockClear(); mockDrain.mockClear(); mockUpload.mockReset(); });

test("no network: the masked frame is saved, never the raw one, and the queue is tried each round", async () => {
  mockUpload.mockResolvedValue({ error: { message: "Network request failed" } });
  await run();
  expect(mockAdd).toHaveBeenCalledTimes(1);
  expect(mockAdd.mock.calls[0][0]).toMatchObject({ journeyId: "j1", base64: "QkFTRTY0" });
  expect(mockAdd.mock.calls[0][0].path).toMatch(/^j1\/\d+\.jpg$/);
  expect(mockDrain).toHaveBeenCalled();
});

test("uploaded fine: nothing is kept on the phone", async () => {
  mockUpload.mockResolvedValue({ error: null });
  await run();
  expect(mockAdd).not.toHaveBeenCalled();
});

test("the server refuses it: not kept, as today", async () => {
  mockUpload.mockResolvedValue({ error: { statusCode: 403, message: "denied" } });
  await run();
  expect(mockAdd).not.toHaveBeenCalled();
});

test.each(["SAFE", "AMBER", "RESOLVED_MONITORING"])("D4 item 11 no network on a calm trip (%s): nothing saved on the phone", async (state) => {
  mockUpload.mockResolvedValue({ error: { message: "Network request failed" } });
  await run(state);
  expect(mockAdd).not.toHaveBeenCalled();
});

test.each(["EMERGENCY", "CRITICAL"])("D4 item 11 no network during an alarm (%s): saved", async (state) => {
  mockUpload.mockResolvedValue({ error: { message: "Network request failed" } });
  await run(state);
  expect(mockAdd).toHaveBeenCalled();
});
