import { palettes, PALETTE_ORDER, isDarkPalette } from "../palettes";
import { deriveTokens } from "../derive";
import { contrastRatio, blend, toHex, ensureContrast } from "../color";

// V1 contrast gate extended to the NEW text/background pairs that the Wave 3
// lane-C components paint, in all 8 palettes. The existing contrast.test.ts
// already covers body/chip/ring/toast/placeholder; this file adds only the
// pairs those components introduce.
describe.each(PALETTE_ORDER)("W3 lane-C pairs meet WCAG AA — %s", (k) => {
  const p = palettes[k];
  const d = deriveTokens(p, isDarkPalette(k));
  const over = (fg: string, bg: string, base: string) => contrastRatio(fg, toHex(blend(bg, base)));

  // CityPicker selected-city label and AreYouSafe typed safe-word both render
  // body text (p.text) over the opaque input surface d.input.bg.
  test("body text on the input surface", () => {
    expect(over(p.text, d.input.bg, p.bgBase)).toBeGreaterThanOrEqual(4.5);
  });

  // AreYouSafeLayout washes the base with a translucent brandSoft. The title is
  // primary text; the muted sub-title is guarded with ensureContrast against the
  // blended surface (exactly what the component computes), so both clear AA.
  test("title and guarded muted text on the AreYouSafe brand wash", () => {
    const washBg = toHex(blend(p.brandSoft, p.bgBase));
    expect(contrastRatio(p.text, washBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(ensureContrast(p.textMuted, washBg), washBg)).toBeGreaterThanOrEqual(4.5);
  });
});

// EmergencyLayout pulses between two fixed reds (palette independent). White copy
// sits on both, and the EMERGENCY footer is red-on-white — all must clear AA.
test("EmergencyLayout white-on-red and red-on-white pairs meet WCAG AA", () => {
  expect(contrastRatio("#FFFFFF", "#DC2626")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#FFFFFF", "#7F1D1D")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#DC2626", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
});
