// INNAYA splash timeline (pure, ms). v2: the engraved woman COMES ALIVE. A Skia
// warp rig plays once over 0.0-1.6 s (one lift, forward extension, single landing;
// hair and drape swing; ring, star and face pinned), with a specular light sweep
// riding the rose-gold, the star warming, and the "INNAYA" wordmark fading in. The
// warp eases in and out and rests EXACTLY on the still (t=0 == t=1 == no motion),
// so there is no loop and no snap. Everything finishes before the 2.0 s hand-off.
// `reducedDoneMs` is the reduce-motion path: the still + wordmark show at once, no
// warp and no sweep, and onDone fires after a short hold. Timing is pure so it can
// be unit-tested without Skia.
export function splashTimeline() {
  return {
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
  } as const;
}
