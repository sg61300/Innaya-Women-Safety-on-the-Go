// Guard (s29 device run): a uniform named `step` collides with the SkSL built-in
// step(), the shader fails to compile, and RuntimeEffect.Make threw at module
// scope, crashing the app on launch. Jest mocks Skia, so it cannot compile SkSL;
// this guard rejects any uniform/const/local named after an SkSL built-in, and
// checks that the effect is built through the crash-safe makeEffect().
// (Proof of the compile itself: CanvasKit 0.39.1 in Node, see vault s29 log.)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path");
declare const __dirname: string; // provided by jest's CommonJS runtime; no @types/node in this project

const src = fs.readFileSync(path.join(__dirname, "../components/SplashSequence.tsx"), "utf8");
const sksl = src.slice(src.indexOf("export const SKSL = `"), src.indexOf("}`;"));

const BUILTINS = [
  "step", "smoothstep", "mix", "clamp", "min", "max", "abs", "sign", "floor", "ceil", "fract", "mod",
  "pow", "exp", "log", "sqrt", "sin", "cos", "tan", "length", "distance", "dot", "cross", "normalize",
  "reflect", "saturate", "sample", "radians", "degrees",
];

test("no SkSL declaration shadows a built-in function", () => {
  const code = sksl.replace(/\/\/.*$/gm, "");
  const declared = [...code.matchAll(/\b(?:uniform\s+)?(?:const\s+)?(?:float|half|int|bool)[234]?(?:x[234])?\s+(\w+)\s*[;=]/g)].map((m) => m[1]);
  expect(declared.length).toBeGreaterThan(5);
  expect(declared.filter((n) => BUILTINS.includes(n))).toEqual([]);
});

test("the shader is created through the crash-safe makeEffect, never bare at module scope", () => {
  expect(src).toMatch(/function makeEffect\(\)[\s\S]*try[\s\S]*RuntimeEffect\.Make\(SKSL\)[\s\S]*catch/);
  expect(src).toMatch(/const effect = makeEffect\(\);/);
});
