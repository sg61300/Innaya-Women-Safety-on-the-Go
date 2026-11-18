// Pure helpers for the spotlight tour. No React, no navigation — same clamping
// as the prototype so the tooltip card never leaves the safe area.
export const nextIndex = (i: number, total: number) => Math.min(i + 1, total - 1);
export const prevIndex = (i: number) => Math.max(i - 1, 0);

// Vertical position of the tooltip card in window coordinates. `tip` is the
// preferred side; if the card would cross the opposite safe edge it flips, then
// the result is clamped into [topSafe, botSafe - cardH].
export function cardTop({ hlY, hlH, tip, cardH = 190, margin = 14, topSafe, botSafe }: {
  hlY: number; hlH: number; tip: "above" | "below"; cardH?: number; margin?: number; topSafe: number; botSafe: number;
}) {
  let top = tip === "below" ? hlY + hlH + margin : hlY - cardH - margin;
  if (tip === "below" && top + cardH > botSafe) top = hlY - cardH - margin;
  if (tip === "above" && top < topSafe) top = hlY + hlH + margin;
  return Math.max(topSafe, Math.min(top, botSafe - cardH));
}
