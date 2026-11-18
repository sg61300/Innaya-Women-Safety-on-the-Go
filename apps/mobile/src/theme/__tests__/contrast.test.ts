import { palettes, PALETTE_ORDER, isDarkPalette } from "../palettes";
import { deriveTokens } from "../derive";
import { contrastRatio, blend, toHex } from "../color";
describe.each(PALETTE_ORDER)("palette %s meets WCAG AA", (k) => {
  const p = palettes[k]; const d = deriveTokens(p, isDarkPalette(k));
  const over = (fg: string, bg: string, base: string) => contrastRatio(fg, toHex(blend(bg, base)));
  test("body and muted text on base", () => {
    expect(contrastRatio(p.text, p.bgBase)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.textMuted, p.bgBase)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.text, p.bgCard)).toBeGreaterThanOrEqual(4.5);
  });
  // Founder ruling 2026-09-26: the primary fill is the DESIGNED colour, never
  // darkened (d.btn.* === p.btn*); the LABEL (d.btn.label) is chosen to pass AA on
  // that fill (white on saturated gradients, ink-plum on the rose-gold CTA).
  test("buttons and SOS", () => {
    // Faces stay the designed colour whenever one label clears AA on all of
    // them (the rose-gold default; exact hexes pinned in directionA.test).
    const raw = [p.btnStart, p.btnMid, p.btnEnd, p.btnDeep];
    if (["#FFFFFF", "#29203B"].some((c) => raw.every((f) => contrastRatio(c, f) >= 4.5))) {
      expect([d.btn.start, d.btn.mid, d.btn.end, d.btn.deep]).toEqual(raw);
    }
    expect(contrastRatio(d.btn.label, d.btn.start)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(d.btn.label, d.btn.mid)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(d.btn.label, d.btn.end)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(d.btn.label, d.btn.deep)).toBeGreaterThanOrEqual(4.5); // pressed face
    expect(contrastRatio("#FFFFFF", d.sos)).toBeGreaterThanOrEqual(4.5); // SOS keeps white on red
  });
  test("every chip", () => {
    for (const c of Object.values(d.chip)) expect(over(c.fg, c.bg, p.bgCard)).toBeGreaterThanOrEqual(4.5);
  });
  test("ring label, toast, input placeholder", () => {
    expect(over(d.ring.label, d.ring.disc, p.bgBase)).toBeGreaterThanOrEqual(4.5);
    expect(over(d.ring.sub, d.ring.disc, p.bgBase)).toBeGreaterThanOrEqual(4.5);
    expect(over(d.toast.fg, d.toast.bg, p.bgBase)).toBeGreaterThanOrEqual(4.5);
    expect(over(d.input.placeholder, d.input.bg, p.bgBase)).toBeGreaterThanOrEqual(4.5);
  });
});
