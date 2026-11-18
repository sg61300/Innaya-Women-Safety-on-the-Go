// Task 26b (structural): importing the camera service must register the real
// on-device masker so the ADR-019/R36 gate is no longer the fail-closed
// NoopMasker. This is pure UI/wiring, so it cannot fail RED via logic — it is a
// structural guard that the `import "./sensors/skiaMasker"` side effect in
// camera.ts is present (and stays present).
jest.mock("../lib/api", () => ({ post: jest.fn() }));
jest.mock("../lib/events", () => ({ events: { log: jest.fn(), flush: jest.fn().mockResolvedValue(undefined) } }));
const mockUpload = jest.fn();
jest.mock("../lib/supabase", () => ({
  supabase: { storage: { from: () => ({ upload: mockUpload }) } },
}));
// G1 (s17): mirror the device — expo-image-manipulator's `SaveFormat` enum is
// undefined in the Hermes bundle. This mock exposes `manipulateAsync` but NO
// `SaveFormat`, so any code that reads `ImageManipulator.SaveFormat.JPEG` throws
// exactly the on-device error and the monitoring frame never scores.
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(async () => ({ uri: "file://small.jpg", width: 640, height: 480 })),
}));

import { getMasker, NoopMasker, setMasker } from "../services/sensors/masker";
import { manipulateAsync } from "expo-image-manipulator";

test("importing camera.ts registers a non-Noop on-device masker (gate is live)", () => {
  // Before the camera module is loaded, the gate is fail-closed.
  expect(getMasker()).toBe(NoopMasker);
  require("../services/camera");
  const active = getMasker();
  expect(active).not.toBe(NoopMasker);
  // The real masker exposes maskFrame; the Noop's maskFrame throws unconditionally.
  expect(typeof active.maskFrame).toBe("function");
});

// G1 (s17): the monitoring frame loop must not depend on the SaveFormat enum at
// runtime. With the enum absent (as on-device), one frame must still reach
// manipulateAsync with the literal `format: "jpeg"`. RED before the fix
// (reading `.JPEG` off undefined throws before manipulateAsync is called),
// GREEN after.
test("G1: monitoring frame passes literal format:'jpeg' to manipulateAsync (no SaveFormat enum)", async () => {
  jest.useFakeTimers();
  const { camera } = require("../services/camera");
  const { useJourney } = require("../store/journey");

  const okMasker = {
    maskFrame: jest.fn(async () => ({
      maskedUri: "data:image/jpeg;base64,AAAA",
      base64: "AAAA",
      plateText: "DL8CAB1234",
      counts: { facesTotal: 0, facesFull: 0, facesEyes: 0, textBoxes: 0 },
      degraded: false,
    })),
  };
  setMasker(okMasker);
  mockUpload.mockResolvedValue({ error: null });
  (globalThis as any).fetch = jest.fn(async () => ({ blob: async () => ({}) }));

  useJourney.getState().reset();
  useJourney.getState().set({ sensors: { mic: false, cam: false, gps: false, ble: false } });
  useJourney.getState().set({ ctx: { state: "AMBER", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } });
  camera.attach({ takePictureAsync: jest.fn(async () => ({ uri: "file://p.jpg" })) } as any);

  camera.start("j1", jest.fn());
  await jest.advanceTimersByTimeAsync(0);
  camera.stop();

  expect(manipulateAsync).toHaveBeenCalledWith(
    "file://p.jpg",
    [{ resize: { width: 640 } }],
    expect.objectContaining({ format: "jpeg" })
  );

  jest.useRealTimers();
});
