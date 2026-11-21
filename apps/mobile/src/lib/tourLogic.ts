// Pure helpers for the spotlight tour. No React, no navigation — same clamping
// as the prototype so the tooltip card never leaves the safe area.
export const nextIndex = (i: number, total: number) => Math.min(i + 1, total - 1);
export const prevIndex = (i: number) => Math.max(i - 1, 0);

// Where the tooltip card goes for a highlighted box, in window coordinates.
// `cardH` is the card's real (measured) height, `minH` the least it can shrink to
// (header + a little body + buttons). Order of resort (founder 2026-11-17):
//  1. the preferred side `tip`, else the other side, else whichever has more
//     room, as long as that side holds `minH`; `maxH` caps the card to the room
//     so it ends `margin` short of the box (the body scrolls);
//  2. else the `reduced` card (tighter padding, lower body cap) on the side with
//     more room, if that side holds `reduced.minH` ("tour cardsize reduction");
//  3. else the minimum reduced card clamped into [topSafe, botSafe]: it overlaps
//     the box, never the footer ("Never cover footer").
export type CardPlace = { top: number; maxH: number; compact: boolean };
export function cardPlacement({ hlY, hlH, tip, cardH, minH = cardH, reduced, margin = 14, topSafe, botSafe }: {
  hlY: number; hlH: number; tip: "above" | "below"; cardH: number; minH?: number;
  reduced?: { cardH: number; minH: number }; margin?: number; topSafe: number; botSafe: number;
}): CardPlace {
  const belowTop = Math.max(topSafe, hlY + hlH + margin);
  const aboveBot = Math.min(botSafe, hlY - margin);
  const room = { below: botSafe - belowTop, above: aboveBot - topSafe };
  const at = (side: "above" | "below", maxH: number, compact: boolean): CardPlace =>
    ({ top: side === "below" ? belowTop : aboveBot - maxH, maxH, compact });
  const other = tip === "below" ? "above" : "below";
  const side = room[tip] < cardH && (room[other] >= cardH || room[other] > room[tip]) ? other : tip;
  if (room[side] >= minH) return at(side, Math.min(cardH, room[side]), false);
  const r = reduced ?? { cardH, minH };
  const big = room.below >= room.above ? "below" : "above";
  if (room[big] >= r.minH) return at(big, Math.min(r.cardH, room[big]), reduced != null);
  const maxH = Math.min(r.cardH, r.minH, botSafe - topSafe);
  const { top } = at(big, maxH, reduced != null);
  return { top: Math.max(topSafe, Math.min(top, botSafe - maxH)), maxH, compact: reduced != null };
}

// Prototype-era API (fixed-height card): the vertical position only.
export function cardTop({ cardH = 190, ...rest }: {
  hlY: number; hlH: number; tip: "above" | "below"; cardH?: number; margin?: number; topSafe: number; botSafe: number;
}) {
  return cardPlacement({ cardH, ...rest }).top;
}
