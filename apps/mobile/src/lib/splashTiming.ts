// Splash timeline (pure). Frames crossfade every `frameMs`; the lockup fades in
// 100 ms after the last frame and holds for `lockupHoldMs` before `onDone`.
// Defaults reproduce the prototype: 5 × 380 ms, lockup at 2000, done at 3600.
export function splashTimeline(frameCount = 5, frameMs = 380, lockupHoldMs = 1600) {
  const frameAt = Array.from({ length: frameCount }, (_, i) => i * frameMs);
  const lockupAt = frameCount * frameMs + 100;
  return { frameAt, lockupAt, doneAt: lockupAt + lockupHoldMs };
}
