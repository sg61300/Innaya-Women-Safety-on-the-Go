import { splashTimeline } from "../lib/splashTiming";

test("timeline matches the prototype (5 × 380 ms, lockup +100, hold 1600)", () => {
  expect(splashTimeline()).toEqual({ frameAt: [0, 380, 760, 1140, 1520], lockupAt: 2000, doneAt: 3600 });
});
