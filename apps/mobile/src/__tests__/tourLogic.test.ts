import { nextIndex, prevIndex, cardTop } from "../lib/tourLogic";

test("index bounds", () => {
  expect(nextIndex(11, 12)).toBe(11);
  expect(nextIndex(0, 12)).toBe(1);
  expect(prevIndex(0)).toBe(0);
  expect(prevIndex(5)).toBe(4);
});

test("card placement flips when it would leave the safe area", () => {
  const base = { cardH: 190, margin: 14, topSafe: 76, botSafe: 686 };
  expect(cardTop({ hlY: 112, hlH: 248, tip: "below", ...base })).toBe(374);
  expect(cardTop({ hlY: 658, hlH: 86, tip: "above", ...base })).toBe(454);
  // 18+36+14 = 68 -> above flips below, then clamps up to topSafe 76
  expect(cardTop({ hlY: 18, hlH: 36, tip: "above", ...base })).toBe(76);
});
