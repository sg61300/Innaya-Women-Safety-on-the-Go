// Build-time guard: every image the catalogue can display must exist on disk as
// a single product cut-out. Rejects (1) any reference whose filename looks like a
// contact sheet / grid / colourways montage, and (2) any reference to a
// known-defective render found by the visual quality gate (cut / half /
// fragmented tiles — see scripts/quality-gate output, 2026-09-06). If any such
// file is ever re-added to the catalogue, the build fails.
// Run: node scripts/check-images.mjs  (Node >= 22 strips the TS types natively.)
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { allImageRefs } from "../src/products/catalog.ts";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "public");
const BANNED = /(sheet|grid|colourways)/i;

// Known-defective renders — must never be referenced. The entire polished-silver
// set for pendant & brooch is a cut/half/fragmented render; plus two oxidised
// crescents. These files stay on disk (for re-render reference) but are denied.
const DEFECTIVE = new Set([
  // pendant — polished-silver (all designs/views)
  ...["locket-slim", "round-slim", "locket-slim-siren", "diamond-pendant"].flatMap((d) =>
    ["front", "angled", "side", "back"].map((v) => `/products/pendant/${d}-${v}-polished-silver.webp`)),
  "/products/pendant/classic-segments-front-polished-silver.webp",
  "/products/pendant/classic-baguette-front-polished-silver.webp",
  // brooch — polished-silver (all designs/views)
  ...["classic-rose-gold", "sunburst-cutout", "diamond-pave", "halo-diamond", "onyx-diamond"].flatMap((d) =>
    ["front", "angled", "side", "back"].map((v) => `/products/brooch/${d}-${v}-polished-silver.webp`)),
  // oxidised-silver crescents
  "/products/pendant/classic-baguette-front-oxidised-silver.webp",
  "/products/pendant/locket-slim-back-oxidised-silver.webp",
  // needs re-render — cropped contact-sheet fragments (a second object's edge /
  // full-bleed grid crop), found by scripts/quality-gate.mjs, eyeball-confirmed
  // 2026-09-07. Every bangle SIDE view and the onyx-diamond brooch SIDE view.
  "/products/bangle/classic-side.webp",
  "/products/bangle/filigree-cutout-side.webp",
  "/products/bangle/mother-of-pearl-side.webp",
  "/products/bangle/diamond-pave-side.webp",
  "/products/bangle/diamond-line-side.webp",
  ...["rose-gold", "gold", "gunmetal"].map((f) => `/products/brooch/onyx-diamond-side-${f}.webp`),
]);

const refs = allImageRefs();
const missing = [];
const banned = [];
const defective = [];

for (const ref of refs) {
  if (BANNED.test(ref)) banned.push(ref);
  if (DEFECTIVE.has(ref)) defective.push(ref);
  const abs = join(publicDir, ref.replace(/^\//, ""));
  if (!existsSync(abs)) missing.push(ref);
}

console.log(`[check-images] ${refs.length} referenced image(s) checked; ${DEFECTIVE.size} in defective deny-list.`);
if (banned.length) { console.error(`[check-images] ${banned.length} banned (sheet/grid/colourways):`); for (const b of banned) console.error("   BANNED    " + b); }
if (defective.length) { console.error(`[check-images] ${defective.length} DEFECTIVE render(s) referenced:`); for (const d of defective) console.error("   DEFECTIVE " + d); }
if (missing.length) { console.error(`[check-images] ${missing.length} MISSING file(s):`); for (const m of missing) console.error("   MISSING   " + m); }
if (banned.length || defective.length || missing.length) {
  console.error("[check-images] FAIL");
  process.exit(1);
}
console.log("[check-images] OK — 0 missing, 0 banned, 0 defective.");
