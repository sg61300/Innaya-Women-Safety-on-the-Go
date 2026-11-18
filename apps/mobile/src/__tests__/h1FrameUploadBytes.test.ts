// H1 (Critical) device-shaped regression. On Android the native `fetch` cannot
// open a `data:` URL — it throws `MalformedURLException: unknown protocol: data`.
// The old camera loop did `fetch(masked.maskedUri).blob()` where `maskedUri` was
// `data:image/jpeg;base64,…`, so masking ran (`mask_applied` logged) but the
// upload failed EVERY frame and `events.model_call` stayed 0 all-time (Tier 3 b10).
//
// This mock reproduces that device shape exactly: `global.fetch` throws the
// Android-style error for any `data:` URL. RED against the pre-fix code (the loop
// throws before uploading, so the storage `upload` is never called); GREEN once
// the loop decodes the masked base64 to bytes and uploads those directly.

jest.mock("../lib/api", () => ({ post: jest.fn(async () => ({ score: 1 })) }));
jest.mock("../lib/events", () => ({ events: { log: jest.fn(), flush: jest.fn().mockResolvedValue(undefined) } }));
const mockUpload = jest.fn(async () => ({ error: null }));
jest.mock("../lib/supabase", () => ({
  supabase: { storage: { from: () => ({ upload: mockUpload }) } },
}));
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(async () => ({ uri: "file://small.jpg", width: 640, height: 480 })),
}));

import { setMasker } from "../services/sensors/masker";
import { toByteArray } from "base64-js";

// "QkFTRTY0" is the base64 of the 6-byte string "BASE64".
const B64 = "QkFTRTY0";
const EXPECTED_BYTES = toByteArray(B64).length; // 6

test("H1: masked frame is uploaded as decoded bytes, never fetched as a data: URL", async () => {
  jest.useFakeTimers();
  const { camera } = require("../services/camera");
  const { useJourney } = require("../store/journey");

  // Android-shaped fetch: opening a `data:` URL throws exactly as native fetch does.
  const fetchSpy = jest.fn(async (input: unknown) => {
    if (typeof input === "string" && input.startsWith("data:")) {
      throw new Error("MalformedURLException: unknown protocol: data");
    }
    return { blob: async () => ({}) } as any;
  });
  (globalThis as any).fetch = fetchSpy;

  const okMasker = {
    maskFrame: jest.fn(async () => ({
      // Pre-fix code reads `.maskedUri` (a data: URL) — kept here so this test is a
      // true RED against that code path; the fix ignores it and decodes `base64`.
      maskedUri: `data:image/jpeg;base64,${B64}`,
      base64: B64,
      plateText: "DL8CAB1234",
      counts: { facesTotal: 0, facesFull: 0, facesEyes: 0, textBoxes: 0 },
      degraded: false,
    })),
  };
  setMasker(okMasker);

  useJourney.getState().reset();
  useJourney.getState().set({ sensors: { mic: false, cam: false, gps: false, ble: false } });
  useJourney.getState().set({ ctx: { state: "AMBER", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } });
  camera.attach({ takePictureAsync: jest.fn(async () => ({ uri: "file://p.jpg" })) } as any);

  camera.start("j1", jest.fn());
  await jest.advanceTimersByTimeAsync(0);
  camera.stop();

  // The upload must have happened with the decoded BYTES...
  expect(mockUpload).toHaveBeenCalledTimes(1);
  const [uploadPath, uploadBody, uploadOpts] = mockUpload.mock.calls[0] as any[];
  expect(uploadBody).toBeInstanceOf(Uint8Array);
  expect((uploadBody as Uint8Array).length).toBe(EXPECTED_BYTES);
  expect(uploadOpts).toEqual({ contentType: "image/jpeg" });
  expect(uploadPath).toMatch(/^j1\/\d+\.jpg$/);

  // ...and fetch must NOT have been used to open a data: URL for the upload.
  for (const call of fetchSpy.mock.calls) {
    expect(String(call[0]).startsWith("data:")).toBe(false);
  }

  jest.useRealTimers();
});
