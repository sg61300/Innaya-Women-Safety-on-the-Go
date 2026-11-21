import { splashTimeline } from "../lib/splashTiming";

// v2 warp timeline: warp 0.0-1.6 s, sweep 0.2-1.4 s, star warms 1.0-1.6 s,
// wordmark 1.5-1.95 s, hand-off at 2.0 s; reduce-motion holds 1.2 s. Timing is
// pure so it is unit-tested without Skia.
test("timeline matches the v2 warp spec", () => {
  expect(splashTimeline()).toEqual({
    warpStartMs: 0,
    warpDurationMs: 1600,
    sweepStartMs: 200,
    sweepDurationMs: 1200,
    starStartMs: 1000,
    starDurationMs: 600,
    wordmarkStartMs: 1500,
    wordmarkDurationMs: 450,
    doneMs: 2000,
    reducedDoneMs: 1200,
  });
});

test("the warp, sweep, star and wordmark all finish before the 2 s hand-off", () => {
  const t = splashTimeline();
  expect(t.warpStartMs + t.warpDurationMs).toBe(1600);
  expect(t.sweepStartMs + t.sweepDurationMs).toBeLessThanOrEqual(t.doneMs);
  expect(t.starStartMs + t.starDurationMs).toBeLessThanOrEqual(t.warpStartMs + t.warpDurationMs);
  expect(t.wordmarkStartMs + t.wordmarkDurationMs).toBeLessThanOrEqual(t.doneMs);
});
