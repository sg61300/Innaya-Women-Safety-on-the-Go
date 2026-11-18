// Task 26b: ML Kit face + text detection on a captured frame. Lazy-requires the
// native modules so this file imports cleanly under jest; returns null when the
// native detectors are absent so the caller falls back to `heavyBlurPlan`
// (mask.ts) and STILL masks before upload. Device-only (R32: not verified here).
import type { Detections, FaceDet, Box } from "./mask";
// Type-only imports (erased at build time -> no native code loaded under jest).
import type { Face } from "@react-native-ml-kit/face-detection";
import type { TextBlock, TextRecognitionResult } from "@react-native-ml-kit/text-recognition";

type FaceDetectionModule = typeof import("@react-native-ml-kit/face-detection").default;
type TextRecognitionModule = typeof import("@react-native-ml-kit/text-recognition").default;

// wearer = the largest face whose centre sits in the bottom-centre zone
// (40% wide x 50% tall), i.e. a chest-mounted / phone-held selfie. A tighter
// selfie-embedding match lands in Day 3+ (per the task note).
function pickWearer(faces: FaceDet[], frame: { w: number; h: number }): number | null {
  const zone = { x0: frame.w * 0.3, x1: frame.w * 0.7, y0: frame.h * 0.5, y1: frame.h };
  let best = -1;
  let bestArea = 0;
  faces.forEach((f, i) => {
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    if (cx >= zone.x0 && cx <= zone.x1 && cy >= zone.y0 && cy <= zone.y1) {
      const area = f.w * f.h;
      if (area > bestArea) {
        bestArea = area;
        best = i;
      }
    }
  });
  return best >= 0 ? best : null;
}

// eyeY = average y of whichever eye landmarks are present; when neither is
// present fall back to top + 0.4*height (the eye line sits ~40% down the box).
function eyeYOf(f: Face): number {
  const ys = [f.landmarks?.leftEye?.position?.y, f.landmarks?.rightEye?.position?.y].filter(
    (v): v is number => typeof v === "number" && isFinite(v)
  );
  if (ys.length > 0) return ys.reduce((a, b) => a + b, 0) / ys.length;
  return f.frame.top + 0.4 * f.frame.height;
}

export async function detect(frameUri: string): Promise<Detections | null> {
  let FaceDetection: FaceDetectionModule;
  let TextRecognition: TextRecognitionModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    FaceDetection = require("@react-native-ml-kit/face-detection").default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    TextRecognition = require("@react-native-ml-kit/text-recognition").default;
  } catch {
    return null; // native detectors absent -> caller uses heavyBlurPlan
  }
  try {
    const faceRes: Face[] = await FaceDetection.detect(frameUri, {
      landmarkMode: "all",
      performanceMode: "fast",
    });
    const textRes: TextRecognitionResult = await TextRecognition.recognize(frameUri);

    const faces: FaceDet[] = (faceRes ?? []).map((f) => ({
      x: f.frame.left,
      y: f.frame.top,
      w: f.frame.width,
      h: f.frame.height,
      eyeY: eyeYOf(f),
    }));

    const blocks: TextBlock[] = textRes?.blocks ?? [];
    const text: Box[] = [];
    const textValues: { box: Box; value: string }[] = [];
    for (const b of blocks) {
      // frame is optional on a block; a block with no bounding box still keeps
      // its text so readPlate() can find the plate number, and gets a zero box.
      const box: Box = {
        x: b.frame?.left ?? 0,
        y: b.frame?.top ?? 0,
        w: b.frame?.width ?? 0,
        h: b.frame?.height ?? 0,
      };
      text.push(box);
      textValues.push({ box, value: b.text ?? "" });
    }
    // frame dims unknown to ML Kit here; wearer zone uses the face/text spread as
    // a proxy frame if real dims are not supplied by the caller.
    const frame = { w: maxRight(faces, text), h: maxBottom(faces, text) };
    return { faces, text, textValues, wearerIndex: pickWearer(faces, frame) };
  } catch {
    return null;
  }
}

const maxRight = (faces: FaceDet[], text: Box[]) =>
  Math.max(1, ...faces.map((f) => f.x + f.w), ...text.map((t) => t.x + t.w));
const maxBottom = (faces: FaceDet[], text: Box[]) =>
  Math.max(1, ...faces.map((f) => f.y + f.h), ...text.map((t) => t.y + t.h));
