export type RGBA = { r: number; g: number; b: number; a: number };
export function parseColor(s: string): RGBA {
  const t = s.trim();
  if (t.startsWith("#")) {
    const h = t.slice(1); const full = h.length <= 4 ? h.split("").map(c => c + c).join("") : h;
    const n = parseInt(full.slice(0, 6), 16); const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
  }
  const m = t.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (!m) throw new Error(`unparseable colour: ${s}`);
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}
export const toHex = (c: RGBA) => "#" + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, "0").toUpperCase()).join("");
export function blend(fg: string, bg: string): RGBA {
  const f = parseColor(fg), b = parseColor(bg);
  return { r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 };
}
function lum(c: RGBA) { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
export function contrastRatio(a: string, b: string): number {
  const la = lum(parseColor(a)), lb = lum(parseColor(b)); const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  let c = blend(fg, "#FFFFFF"); // treat translucent fg as opaque over white for the search
  const bgL = lum(parseColor(bg)); const towardDark = bgL > 0.4;
  for (let i = 0; i < 40 && contrastRatio(toHex(c), bg) < min; i++) {
    const k = towardDark ? 0.96 : 1.04;
    c = { r: Math.min(255, c.r * k + (towardDark ? 0 : 6)), g: Math.min(255, c.g * k + (towardDark ? 0 : 6)), b: Math.min(255, c.b * k + (towardDark ? 0 : 6)), a: 1 };
  }
  return toHex(c);
}
// Like ensureContrast but moves the BACKGROUND toward black (4% steps) while fg stays fixed,
// until contrastRatio(fg, bg) >= min. Returns the source bg unchanged when it already passes.
export function darkenUntil(bg: string, fg: string, min = 4.5): string {
  if (contrastRatio(fg, bg) >= min) return bg;
  let c = blend(bg, "#000000"); // treat translucent bg as opaque over black for the search
  for (let i = 0; i < 40 && contrastRatio(fg, toHex(c)) < min; i++) {
    c = { r: c.r * 0.96, g: c.g * 0.96, b: c.b * 0.96, a: 1 };
  }
  return toHex(c);
}
