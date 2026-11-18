import { palettes, PALETTE_ORDER, PALETTE_META, isDarkPalette } from "../palettes";
test("eight palettes in prototype order, each with the full token set", () => {
  expect(PALETTE_ORDER).toEqual(["midnight", "violetBloom", "rosePetal", "blushLavender", "oceanMist", "goldenIvory", "sakuraDawn", "darkCherry"]);
  for (const k of PALETTE_ORDER) {
    const p = palettes[k];
    for (const key of ["bgBase", "bgCard", "brand", "brandBright", "stateSafe", "stateWatch", "stateDanger", "stateCritical", "text", "textMuted", "textFaint", "btnStart", "btnEnd", "btnDeep"]) expect(p[key as keyof typeof p]).toMatch(/^#|^rgba?\(/);
    expect(PALETTE_META[k].label.length).toBeGreaterThan(0);
  }
  expect(palettes.violetBloom.brand).toBe("#7F559C"); // s25 direction A +violet
  expect(palettes.midnight.bgBase).toBe("#17131F"); // s25 direction A dark ink plum
  expect(isDarkPalette("midnight")).toBe(true); expect(isDarkPalette("darkCherry")).toBe(true); expect(isDarkPalette("violetBloom")).toBe(false);
});
