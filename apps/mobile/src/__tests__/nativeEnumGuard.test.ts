// Guard (founder s17: "why are the same errors coming again and again — fix
// things properly"). Native-module namespace objects (the `Skia` runtime object,
// `ImageManipulator`, `Camera`, `FileSystem`) do NOT carry their TS enums at
// runtime on Hermes — the enums are TOP-LEVEL exports. Reading an enum member off
// the namespace object (`Skia.ImageFormat.JPEG`, `ImageManipulator.SaveFormat.JPEG`,
// `Skia.ClipOp.Intersect`) is `undefined.MEMBER` and throws, silently killing the
// whole frame pipeline. This test fails the build if any such read reappears in
// the frame pipeline source.
//
// Allowed alternatives (put in the failure message too):
//   - import the enum from the package top level:
//       `const { ImageFormat, ClipOp } = require("@shopify/react-native-skia");`
//     or `import { SaveFormat } from "expo-image-manipulator";`
//   - or pass the verified numeric literal with a comment naming the enum,
//       e.g. `encodeToBase64(3 /* ImageFormat.JPEG */, 60)`.
//
// RED against main 27b18a8 (catches mask.ts: Skia.ImageFormat.JPEG and
// Skia.ClipOp.Intersect); GREEN after the G1b fix.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path");
declare const __dirname: string; // provided by jest's CommonJS runtime; no @types/node in this project

const SERVICES = path.join(__dirname, "..", "services");

// Frame-pipeline source: the sensors dir (mask/detect/plate/masker/skiaMasker) plus
// the camera capture->mask->upload->analyze loop. Comments are stripped before
// matching so explanatory prose naming the anti-pattern is not a false positive.
function collectSources(): string[] {
  const files: string[] = [path.join(SERVICES, "camera.ts")];
  const sensorsDir = path.join(SERVICES, "sensors");
  for (const f of fs.readdirSync(sensorsDir)) {
    if (f.endsWith(".ts") && !f.endsWith(".d.ts")) files.push(path.join(sensorsDir, f));
  }
  return files;
}

// Replace block comments with equal-length whitespace (line count preserved), then
// drop line comments per line. String-literal edge cases are irrelevant here — the
// pipeline never puts `//` or `Skia.X.Y` inside a string.
function stripComments(src: string): string[] {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return noBlock.split(/\r?\n/).map((line) => line.replace(/\/\/.*$/, ""));
}

// (a) explicit known enum namespaces, ANY member casing (catches ClipOp.Intersect);
// (b) the general shape: a namespace object, an enum-like PascalCase member, and an
//     ALL-CAPS enum value (catches ImageFormat.JPEG / SaveFormat.PNG).
const EXPLICIT =
  /\b(Skia\.(ImageFormat|ClipOp|AlphaType|ColorType|PaintStyle|BlendMode|TileMode|FilterMode|MipmapMode|FontSlant|StrokeCap|StrokeJoin|PointMode)|ImageManipulator\.SaveFormat|Camera\.(FlashMode|CameraType)|FileSystem\.EncodingType)\.[A-Za-z_]+/;
const GENERAL = /\b(Skia|ImageManipulator|Camera|FileSystem)\.[A-Z][A-Za-z]+\.[A-Z_]+\b/;

test("no native-module enum read off a namespace object in the frame pipeline", () => {
  const violations: string[] = [];
  for (const file of collectSources()) {
    const lines = stripComments(fs.readFileSync(file, "utf8"));
    lines.forEach((line, i) => {
      const m = EXPLICIT.exec(line) || GENERAL.exec(line);
      if (m) violations.push(`${path.basename(file)}:${i + 1}  ${m[0]}`);
    });
  }
  if (violations.length) {
    throw new Error(
      "Native-module enum read off a namespace object (undefined on Hermes — throws " +
        "and kills the frame pipeline):\n  " +
        violations.join("\n  ") +
        "\nUse a top-level import (e.g. `const { ImageFormat, ClipOp } = " +
        'require("@shopify/react-native-skia")`, `import { SaveFormat } from ' +
        '"expo-image-manipulator"`) or a verified numeric literal with a comment ' +
        "naming the enum (e.g. `3 /* ImageFormat.JPEG */`)."
    );
  }
  expect(violations).toEqual([]);
});
