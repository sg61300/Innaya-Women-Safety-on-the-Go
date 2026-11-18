// Guard (R58 pattern sweep for H1). Android's native `fetch` cannot open a
// `data:` URL — it throws `MalformedURLException: unknown protocol: data`. The H1
// defect was exactly this: the camera loop did `fetch(\`data:image/...\`).blob()`
// to build the upload body, which failed every frame on device. This test fails
// the build if any `fetch(...)` in `services/` is passed a `data:` URL string, so
// the anti-pattern cannot silently reappear.
//
// Allowed alternative (put in the failure message too): decode the base64 to
// bytes (e.g. `toByteArray` from `base64-js`) and pass the `Uint8Array`/
// `ArrayBuffer` directly to the storage client or `FormData`.
//
// RED against the pre-fix camera.ts (which had `fetch(masked.maskedUri)` where
// maskedUri was a `data:` URL); GREEN after H1.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path");
declare const __dirname: string; // jest CommonJS runtime; no @types/node in this project

const SERVICES = path.join(__dirname, "..", "services");

// Every .ts under services/ (recursively), excluding .d.ts.
function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSources(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

// Strip block comments (preserving line count) then line comments, so prose that
// names the anti-pattern is not a false positive.
function stripComments(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return noBlock
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

// `fetch(` (optionally `await fetch(`) whose argument opens a `data:` URL string
// literal in any quote style (', ", `). Matches across the call's leading
// whitespace so `fetch(\n  "data:..."` is caught too.
const FETCH_DATA_URL = /\bfetch\s*\(\s*(?:await\s+)?[`'"]data:/;

test("no fetch() of a data: URL anywhere in services/ (native fetch rejects data:)", () => {
  const violations: string[] = [];
  for (const file of collectSources(SERVICES)) {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    src.split(/\r?\n/).forEach((line, i) => {
      if (FETCH_DATA_URL.test(line)) {
        violations.push(`${path.relative(SERVICES, file)}:${i + 1}  ${line.trim()}`);
      }
    });
  }
  if (violations.length) {
    throw new Error(
      "fetch() called with a `data:` URL in services/ (Android native fetch throws " +
        "MalformedURLException: unknown protocol: data — the upload fails every " +
        "frame):\n  " +
        violations.join("\n  ") +
        "\nDecode the base64 to bytes (e.g. `toByteArray` from `base64-js`) and pass " +
        "the Uint8Array/ArrayBuffer directly to the storage client instead."
    );
  }
  expect(violations).toEqual([]);
});
