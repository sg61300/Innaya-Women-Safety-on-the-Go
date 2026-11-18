// G1b (s17): device-shaped regression for applyMask (the Skia raster).
// On Hermes the native `Skia` runtime object carries the FACTORIES (Data, Image,
// Surface, ImageFilter) but NOT the enums: `ImageFormat` and `ClipOp` are
// top-level exports of @shopify/react-native-skia. The old code read
// `Skia.ImageFormat.JPEG` / `Skia.ClipOp.Intersect`, so on device it threw
// "Cannot read property 'JPEG'/'Intersect' of undefined" and every monitoring
// frame failed to mask and never reached the scorer.
//
// This mock reproduces that device shape exactly: the `Skia` object has NO
// `ImageFormat` and NO `ClipOp`, while the module exports both enums at the top
// level (JPEG === 3, Intersect === 1, verified from the package source).
// RED against the pre-fix code (throws); GREEN once the enums are read off the
// module namespace instead of off `Skia`.

jest.mock("@shopify/react-native-skia", () => {
  const encodeToBase64 = jest.fn(() => "QkFTRTY0");
  const clipRect = jest.fn();
  const canvas = {
    drawImageRect: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    clipRect,
  };
  const surface = {
    getCanvas: () => canvas,
    makeImageSnapshot: () => ({ encodeToBase64 }),
  };
  const image = { width: () => 640, height: () => 480 };
  return {
    // The native Skia object: FACTORIES ONLY. No ImageFormat, no ClipOp — the
    // whole point of the regression.
    Skia: {
      Data: { fromURI: jest.fn(async () => ({})) },
      Image: { MakeImageFromEncoded: () => image },
      Surface: { MakeOffscreen: () => surface },
      XYWHRect: (x: number, y: number, w: number, h: number) => ({ x, y, w, h }),
      Paint: () => ({ setImageFilter: jest.fn() }),
      ImageFilter: { MakeBlur: jest.fn(() => ({})) },
      // Expose the spies so the test can assert on them without out-of-scope refs.
      __spies: { encodeToBase64, clipRect },
    },
    // Top-level enum exports, as in the real package:
    ImageFormat: { JPEG: 3, PNG: 4, WEBP: 6 },
    ClipOp: { Difference: 0, Intersect: 1 },
  };
});

import { applyMask, heavyBlurPlan } from "../services/sensors/mask";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { encodeToBase64, clipRect } = require("@shopify/react-native-skia").Skia.__spies;

beforeEach(() => {
  encodeToBase64.mockClear();
  clipRect.mockClear();
});

test("applyMask encodes with the top-level ImageFormat.JPEG (3), not Skia.ImageFormat", async () => {
  // Empty-regions plan — the exact b9 path: no detections, straight to encode.
  const uri = await applyMask("file:///frame.jpg", {
    regions: [],
    counts: { facesTotal: 0, facesFull: 0, facesEyes: 0, textBoxes: 0 },
  });
  // H1: applyMask returns the RAW base64 body, never a `data:` URL.
  expect(uri).toBe("QkFTRTY0");
  expect(encodeToBase64).toHaveBeenCalledWith(3, 60);
});

test("applyMask clips regions with the top-level ClipOp.Intersect (1), not Skia.ClipOp", async () => {
  // A region drives the masking loop so the ClipOp read is exercised too.
  await applyMask("file:///frame.jpg", heavyBlurPlan({ w: 640, h: 480 }));
  expect(clipRect).toHaveBeenCalledTimes(1);
  expect(clipRect.mock.calls[0][1]).toBe(1); // ClipOp.Intersect
  expect(encodeToBase64).toHaveBeenCalledWith(3, 60);
});
