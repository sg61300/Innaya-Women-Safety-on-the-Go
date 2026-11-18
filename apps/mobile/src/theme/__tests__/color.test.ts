import { parseColor, blend, contrastRatio, ensureContrast, toHex } from "../color";
test("parse and blend", () => {
  expect(parseColor("#FFFFFF")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  expect(parseColor("rgba(5,150,105,0.10)")).toEqual({ r: 5, g: 150, b: 105, a: 0.1 });
  expect(toHex(blend("rgba(0,0,0,0.5)", "#FFFFFF"))).toBe("#808080");
});
test("contrast ratios match the audited values", () => {
  expect(contrastRatio("#1E1340", "#FAF8FF")).toBeCloseTo(16.31, 1);
  expect(contrastRatio("#6EE7B7", "#FFFFFF")).toBeCloseTo(1.52, 1);
  expect(contrastRatio("#FFFFFF", "#7C3AED")).toBeCloseTo(5.7, 1);
});
test("ensureContrast darkens on light and lightens on dark until 4.5", () => {
  const fixed = ensureContrast("#6EE7B7", "#FFFFFF");
  expect(contrastRatio(fixed, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  const fixedDark = ensureContrast("#7A6EAA", "#1E1A3A");
  expect(contrastRatio(fixedDark, "#1E1A3A")).toBeGreaterThanOrEqual(4.5);
  expect(ensureContrast("#1E1340", "#FAF8FF")).toBe("#1E1340"); // already fine → unchanged
});
