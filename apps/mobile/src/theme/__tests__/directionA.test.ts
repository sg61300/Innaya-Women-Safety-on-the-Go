import { palettes } from "../palettes";
import { deriveTokens } from "../derive";

// s25 lane E6 — guard for app direction A + the founder's "+violet" tint ruling
// (2026-09-25 direction A / plum, 2026-09-26 tint +violet). Locks the exact token
// values the two default palettes ship so a future edit can't silently drift the
// approved look. Token NAMES are unchanged, so no screen edits are needed.
describe("direction A + violet tint tokens", () => {
  test("violetBloom (light default) carries the approved values", () => {
    const p = palettes.violetBloom;
    expect(p.bgBase).toBe("#F4EEF8");      // lilac base
    expect(p.bgCard).toBe("#FFFFFF");      // surface / cards
    expect(p.bgRaised).toBe("#EEE5F4");    // subtle / fields
    expect(p.text).toBe("#29203B");        // ink plum
    expect(p.textMuted).toBe("#6B5E88");   // AA on the lilac base
    expect(p.border).toBe("#E3DAEC");      // hairline
    expect(p.brand).toBe("#7F559C");       // violet-plum accent
    expect(p.brandSoft).toBe("#E9DDF4");   // orchid-mist accentSoft
    expect(p.rose).toBe("#C6997A");        // satin rose-gold (hairline / outline)
    expect(p.btnStart).toBe("#C6997A");    // primary CTA fill = rose-gold (flat)
    expect(p.btnDeep).toBe("#B4886B");     // pressed rose-gold
  });

  test("midnight (dark default) carries the approved values", () => {
    const p = palettes.midnight;
    expect(p.bgBase).toBe("#17131F");      // ink plum base
    expect(p.bgCard).toBe("#221A32");      // surface
    expect(p.text).toBe("#F1ECE2");
    expect(p.brand).toBe("#B7A3EA");       // lilac accent
    expect(p.brandSoft).toBe("#2E2440");   // accentSoft dark
    expect(p.btnStart).toBe("#C6997A");    // same rose-gold CTA in dark
    const dm = deriveTokens(p, true);
    expect(dm.btn.mid).toBe("#C6997A");
    expect(dm.btn.label.toUpperCase()).toBe("#29203B"); // ink label on rose-gold, even in dark theme
  });

  // SOS stays the ONLY red: the derived SOS colour is the fixed danger red, and no
  // primary/secondary surface token in the light default equals it.
  test("SOS red is reserved — no default surface reuses it", () => {
    const p = palettes.violetBloom;
    const d = deriveTokens(p, false);
    const RED = "#DC2626";
    // Founder ruling 2026-09-26: primary CTA keeps the EXACT rose-gold fill (no
    // derive-darkening) with an ink-plum label; pressed = #B4886B.
    expect(d.btn.mid).toBe("#C6997A");
    expect(d.btn.deep).toBe("#B4886B");
    expect(d.btn.label.toUpperCase()).toBe("#29203B");
    expect(d.sos).toBe(RED);
    for (const c of [p.brand, p.brandSoft, p.btnStart, p.btnMid, p.btnEnd, p.bgBase, p.bgCard, p.bgRaised, d.card.bg, d.input.bg, d.btn.mid]) {
      expect(c.toUpperCase()).not.toBe(RED);
    }
  });
});
