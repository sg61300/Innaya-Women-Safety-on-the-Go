import type { Palette } from "./palettes";
import { ensureContrast, contrastRatio, darkenUntil, blend, toHex } from "./color";
export type ChipKind = "safe" | "amber" | "danger" | "critical" | "brand" | "neutral";
export type DerivedTokens = {
  sos: string; sosDeep: string; onPrimary: string;
  btn: { start: string; mid: string; end: string; deep: string; label: string };
  chip: Record<ChipKind, { fg: string; bg: string }>;
  ring: { disc: string; label: string; sub: string; stateColor: Record<"idle" | "safe" | "amber" | "emergency" | "critical", string> };
  toast: { bg: string; fg: string };
  input: { bg: string; border: string; placeholder: string };
  card: { bg: string; border: string };
};
export function deriveTokens(p: Palette, isDark: boolean): DerivedTokens {
  const card = p.bgCard;
  const chipBg = (rgb: string, a: number) => `rgba(${rgb},${a})`;
  const rgb = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };
  const mk = (fgWish: string, bg: string) => ({ fg: ensureContrast(fgWish, toHex(blend(bg, card))), bg });
  const chip = {
    safe: mk(isDark ? "#6EE7B7" : "#065F46", chipBg(rgb(p.stateSafe), 0.12)),
    amber: mk(isDark ? "#FCD34D" : "#92400E", chipBg(rgb(p.stateWatch), 0.14)),
    danger: mk(isDark ? "#FDA4AF" : "#991B1B", chipBg(rgb(p.stateDanger), 0.10)),
    critical: mk(isDark ? "#FB7185" : "#9F1239", chipBg(rgb(p.stateCritical), 0.12)),
    brand: mk(isDark ? p.brand : p.brandBright, p.brandSoft),
    neutral: mk(p.textMuted, isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"),
  };
  const disc = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.85)";
  const discSolid = toHex(blend(disc, p.bgBase));
  const toastBg = p.brandSoft;
  const inputBg = p.bgRaised;
  return {
    sos: "#DC2626", sosDeep: "#991B1B",
    onPrimary: "#FFFFFF",
    // Founder ruling 2026-09-26: the primary fill is the DESIGNED colour, never
    // darkened (keep the exact rose-gold #C6997A / pressed #B4886B). The LABEL is
    // chosen to pass AA on EVERY face it sits on (start/mid/end + pressed deep):
    // white where it clears 4.5:1 on all of them, else ink-plum #29203B (the
    // direction-A ink; this is the rose-gold case). Only where NO single label
    // clears every face (gradient palettes spanning a light start to a dark
    // deep) do we fall back to white and darken those faces until it clears.
    // Danger/SOS keeps white on red (d.sos) below.
    btn: (() => {
      const faces = [p.btnStart, p.btnMid, p.btnEnd, p.btnDeep];
      const clearsAll = (c: string) => faces.every((f) => contrastRatio(c, f) >= 4.5);
      if (clearsAll("#FFFFFF") || clearsAll("#29203B")) {
        return { start: p.btnStart, mid: p.btnMid, end: p.btnEnd, deep: p.btnDeep, label: clearsAll("#FFFFFF") ? "#FFFFFF" : "#29203B" };
      }
      const [start, mid, end, deep] = faces.map((f) => darkenUntil(f, "#FFFFFF"));
      return { start, mid, end, deep, label: "#FFFFFF" };
    })(),
    chip,
    ring: { disc, label: ensureContrast(isDark ? "#FFFFFF" : p.text, discSolid), sub: ensureContrast(p.textMuted, discSolid),
      stateColor: { idle: p.brand, safe: p.stateSafe, amber: p.stateWatch, emergency: p.stateDanger, critical: p.stateCritical } },
    toast: { bg: toastBg, fg: ensureContrast(p.text, toHex(blend(toastBg, p.bgBase))) },
    input: { bg: inputBg, border: p.borderBright, placeholder: ensureContrast(p.textFaint, toHex(blend(inputBg, p.bgBase))) },
    card: { bg: card, border: p.border },
  };
}
