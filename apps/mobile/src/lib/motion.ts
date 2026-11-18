// ONE source for every in-app motion amount and speed (founder 2026-10-11, Lane
// A2). These numbers are the FOUNDER'S call: they are starting values only,
// recorded on the emulator and listed in the lane report for the founder to
// judge and tune. Every call site also stops when its screen is not visible and
// renders STILL when the OS "reduce motion" setting is on (see useMotionActive).
//
// All periods are a full cycle in ms; all scales are multipliers of the rest size.
export const MOTION = {
  // Home hero medallion: a gentle breathing swell + a soft light pool under it in
  // the state colour. Breathing is SLOW when safe and gets QUICKER as the state
  // escalates (amber → emergency → critical), per the founder.
  medallion: {
    // Founder 2026-10-12: use the preview's numbers — swell 1.0–1.03, light-pool
    // opacity 0.35–0.85 (pool scale 0.92–1.04 to match the preview breathe).
    scaleMin: 1.0,
    scaleMax: 1.03, // swell amount (~3%)
    poolScaleMin: 0.92,
    poolScaleMax: 1.04,
    poolOpacityMin: 0.35,
    poolOpacityMax: 0.85,
    // full breath period by state (ms): lower = quicker breathing. STARTING values
    // (founder has NOT judged these yet — listed as a question in the lane report).
    periodMs: { idle: 4200, safe: 3600, amber: 2200, emergency: 1300, critical: 950 } as Record<string, number>,
  },

  // Vitals "heartbeat": a quick double beat (lub-dub) then a rest, repeating, on
  // the vitals icon (Home card, Profile vitals row, Guardian tab). STARTING values
  // (founder to judge beat gap / rest / scale — listed as questions in the report).
  heartbeat: {
    beatScale: 1.18, // peak scale of each beat
    beatUpMs: 110, // rise to the beat
    beatDownMs: 140, // fall back to rest
    gapMs: 120, // short gap between the "lub" and the "dub"
    restMs: 900, // long rest after the "dub" before the cycle repeats
  },

  // P3 unsafe-regions pin (class-map-pin): bobs up and down AND breathes
  // (expand/contract) together.
  pin: {
    bobPx: 5, // peak vertical travel
    scaleMin: 0.93,
    scaleMax: 1.07,
    periodMs: 1900,
  },

  // P16 safety phone (tool-safety-phone): breathes (upright).
  safetyPhone: {
    scaleMin: 0.955,
    scaleMax: 1.045,
    periodMs: 2500,
  },

  // P14 personal alarm (tool-personal-alarm): a pulsing ring of light drawn in
  // code over the alarm's centre button, so it reads as an alarm going off.
  alarmPulse: {
    periodMs: 1250,
    ringStartScale: 0.55, // ring starts near the button, expands outward
    ringEndScale: 1.7,
    opacityStart: 0.55,
  },

  // P11 video-check (simulate-videocall-left / -right): the two phones drift in
  // OPPOSITE directions (one up while the other is down). The Live footer charm
  // (tab-live) sits between them and turns so its lens faces whichever phone is
  // higher (founder example: right phone up, left down → camera tilts so the lens
  // faces the top phone).
  videoCheck: {
    driftPx: 7, // each phone's peak vertical travel (opposite phase)
    periodMs: 2600,
    cameraTiltDeg: 28, // how far the camera rotates toward the higher phone
  },

  // P10 go-live 3D phone turn is a pre-rendered animated webp (24 fps) played by
  // Skia's useAnimatedImageValue, which advances frames at the file's own rate and
  // loops; no numbers to tune here beyond the display box size below.
  goLive: {
    boxPx: 64, // render box on the simulate card (was a 56px static illustration)
  },
} as const;
