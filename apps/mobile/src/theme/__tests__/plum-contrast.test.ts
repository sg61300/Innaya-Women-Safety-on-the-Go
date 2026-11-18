import { palettes } from "../palettes";
import { deriveTokens } from "../derive";
import { contrastRatio } from "../color";

// Guard for the founder's 2026-10-09 deep-plum dark identity. "system" resolves
// to `midnight` (ThemeProvider), so these are the pairs every screen renders.
// Body text/background must clear WCAG AA 4.5:1; large text and the on-red
// label must clear 3:1 / 4.5:1 as noted. If a future palette edit drops a pair
// below the floor, this test fails before it reaches a build.
const p = palettes.midnight;
const d = deriveTokens(p, true);

describe("deep-plum (midnight) AA contrast", () => {
  test.each([
    ["text on bgBase", p.text, p.bgBase],
    ["text on bgRaised", p.text, p.bgRaised],
    ["text on bgCard", p.text, p.bgCard],
    ["text on bgCard2", p.text, p.bgCard2],
    ["textMuted on bgBase", p.textMuted, p.bgBase],
    ["textMuted on bgCard", p.textMuted, p.bgCard],
  ])("%s >= 4.5", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  test("white on SOS red >= 4.5", () => {
    expect(contrastRatio(d.onPrimary, d.sos)).toBeGreaterThanOrEqual(4.5);
  });

  test("rose-gold accent on bgBase >= 3 (large text / icon)", () => {
    expect(contrastRatio(p.rose, p.bgBase)).toBeGreaterThanOrEqual(3);
  });

  test("the primary button stays rose-gold and its label clears every face", () => {
    expect(d.btn.start.toUpperCase()).toBe("#C6997A");
    for (const face of [d.btn.start, d.btn.mid, d.btn.end, d.btn.deep]) {
      expect(contrastRatio(d.btn.label, face)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("safe (call) green and teal (video) stay readable on cards >= 3", () => {
    expect(contrastRatio(p.stateSafe, p.bgCard)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(p.teal, p.bgCard)).toBeGreaterThanOrEqual(3);
  });
});
