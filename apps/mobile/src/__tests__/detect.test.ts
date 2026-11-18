// Task 26b: detect() maps the installed ML Kit face + text APIs to Detections.
// The native modules are mocked (virtual) so jest never loads native code.
// See detect.ts: eyeY = average of the eye landmarks' y (fallback top+0.4h),
// wearer = largest face whose centre sits in the bottom-centre zone.

// A text block anchoring the wearer-zone proxy frame to ~640x480 so the
// bottom-centre heuristic is deterministic across cases.
const anchorBlock = { text: "", frame: { left: 600, top: 440, width: 40, height: 40 } };

function loadDetect(faceMock: unknown, textMock: unknown) {
  let detect!: typeof import("../services/sensors/detect").detect;
  jest.isolateModules(() => {
    if (faceMock instanceof Error) {
      jest.doMock("@react-native-ml-kit/face-detection", () => {
        throw faceMock;
      }, { virtual: true });
    } else {
      jest.doMock("@react-native-ml-kit/face-detection", () => ({ default: faceMock }), {
        virtual: true,
      });
    }
    jest.doMock("@react-native-ml-kit/text-recognition", () => ({ default: textMock }), {
      virtual: true,
    });
    detect = require("../services/sensors/detect").detect;
  });
  return detect;
}

afterEach(() => jest.resetModules());

test("two faces with landmarks -> eyeY is the average of both eyes, wearer is bottom-centre", async () => {
  const faces = [
    {
      // wearer: bottom-centre of the ~640x480 proxy frame
      frame: { left: 280, top: 340, width: 120, height: 120 },
      landmarks: { leftEye: { position: { x: 300, y: 380 } }, rightEye: { position: { x: 360, y: 400 } } },
    },
    {
      // non-wearer: top-left
      frame: { left: 40, top: 50, width: 100, height: 120 },
      landmarks: { leftEye: { position: { x: 60, y: 90 } }, rightEye: { position: { x: 100, y: 100 } } },
    },
  ];
  const detect = loadDetect(
    { detect: jest.fn().mockResolvedValue(faces) },
    { recognize: jest.fn().mockResolvedValue({ text: "", blocks: [anchorBlock] }) }
  );
  const d = await detect("file://frame.jpg");
  expect(d).not.toBeNull();
  expect(d!.faces[0]).toEqual({ x: 280, y: 340, w: 120, h: 120, eyeY: 390 }); // (380+400)/2
  expect(d!.faces[1]).toEqual({ x: 40, y: 50, w: 100, h: 120, eyeY: 95 }); // (90+100)/2
  expect(d!.wearerIndex).toBe(0);
});

test("passes landmarkMode:all + performanceMode:fast to the detector", async () => {
  const faceDetect = jest.fn().mockResolvedValue([]);
  const detect = loadDetect(
    { detect: faceDetect },
    { recognize: jest.fn().mockResolvedValue({ text: "", blocks: [] }) }
  );
  await detect("file://f.jpg");
  expect(faceDetect).toHaveBeenCalledWith("file://f.jpg", {
    landmarkMode: "all",
    performanceMode: "fast",
  });
});

test("missing landmarks -> eyeY falls back to top + 0.4*height", async () => {
  const faces = [{ frame: { left: 10, top: 20, width: 100, height: 200 } }]; // no landmarks
  const detect = loadDetect(
    { detect: jest.fn().mockResolvedValue(faces) },
    { recognize: jest.fn().mockResolvedValue({ text: "", blocks: [] }) }
  );
  const d = await detect("file://f.jpg");
  expect(d!.faces[0].eyeY).toBe(100); // 20 + 0.4*200
});

test("only one eye landmark present -> eyeY is that eye's y", async () => {
  const faces = [
    { frame: { left: 0, top: 0, width: 80, height: 80 }, landmarks: { leftEye: { position: { x: 10, y: 33 } } } },
  ];
  const detect = loadDetect(
    { detect: jest.fn().mockResolvedValue(faces) },
    { recognize: jest.fn().mockResolvedValue({ text: "", blocks: [] }) }
  );
  const d = await detect("file://f.jpg");
  expect(d!.faces[0].eyeY).toBe(33);
});

test("no face in the bottom-centre zone -> wearerIndex is null (fail-safe: all masked full)", async () => {
  const faces = [{ frame: { left: 40, top: 50, width: 100, height: 120 }, landmarks: {} }];
  const detect = loadDetect(
    { detect: jest.fn().mockResolvedValue(faces) },
    { recognize: jest.fn().mockResolvedValue({ text: "", blocks: [anchorBlock] }) }
  );
  const d = await detect("file://f.jpg");
  expect(d!.wearerIndex).toBeNull();
});

test("text blocks map to boxes and textValues carry the recognised text", async () => {
  const blocks = [
    { text: "KA01AB1234", frame: { left: 10, top: 400, width: 200, height: 40 } },
    { text: "no-frame-block" }, // frame undefined -> zero box, value still preserved
  ];
  const detect = loadDetect(
    { detect: jest.fn().mockResolvedValue([]) },
    { recognize: jest.fn().mockResolvedValue({ text: "x", blocks }) }
  );
  const d = await detect("file://f.jpg");
  expect(d!.text[0]).toEqual({ x: 10, y: 400, w: 200, h: 40 });
  expect(d!.text[1]).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  expect(d!.textValues.map((t) => t.value)).toEqual(["KA01AB1234", "no-frame-block"]);
});

test("native detectors absent (require throws) -> detect returns null", async () => {
  const detect = loadDetect(new Error("not linked"), { recognize: jest.fn() });
  await expect(detect("file://f.jpg")).resolves.toBeNull();
});

test("detector rejects at runtime -> detect returns null (degraded, caller heavy-blurs)", async () => {
  const detect = loadDetect(
    { detect: jest.fn().mockRejectedValue(new Error("boom")) },
    { recognize: jest.fn().mockResolvedValue({ text: "", blocks: [] }) }
  );
  await expect(detect("file://f.jpg")).resolves.toBeNull();
});
