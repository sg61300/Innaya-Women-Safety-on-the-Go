// INNAYA video-splash timing (pure, ms). s32: the founder-approved walking-logo
// video (walk-rosegold-seed11-stars-v2.mp4, h264 640x640) runs ~5.06 s. The
// splash plays it ONCE and hands off when the player reports `playToEnd`;
// `doneFallbackMs` is a safety net so the splash can never get stuck if the end
// event is dropped (slow decoder, codec issue, player error). `reducedDoneMs` is
// the reduce-motion path: no video, a short hold on the static wordmark, then
// hand-off. Pure so it can be reasoned about / unit-tested without the player.
//
// NOTE (open): the 5.06 s figure is the measured file length. If the founder
// wants the on-screen splash shorter/longer than the clip, that is a separate
// timing decision — see the s32 report.
export function splashVideoTiming() {
  return {
    videoDurationMs: 5060,
    // video length + ~0.5 s buffer; only used if `playToEnd` never fires.
    doneFallbackMs: 5600,
    reducedDoneMs: 1200,
  } as const;
}
