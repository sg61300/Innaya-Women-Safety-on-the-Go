// INNAYA splash warp math — single source of truth, shared by the SkSL shader in
// SplashSequence.tsx (mirrored line-for-line) and by splashWarp.test.ts.
//
// It is a faithful port of the founder's motion reference
// the brand render rig (the "v2" rig): one lift and
// forward extension with a single landing, two phased wind fields for hair and
// drape, the figure's step roughly 2x the first reference and the wind exactly
// 2x. The face and neck translate RIGIDLY (a uniform vector, never warped); the
// ring and star are pinned (handled in the shader via a static mask texture, not
// here). All coordinates are in the 1024 px MASTER space (SCALE = 1); the shader
// maps device pixels into this space before calling these functions.
//
// Reference constants, kept here so the test can assert they never drift:
export const V2 = {
  // step (lift + extension) coefficients, source px, from render.mjs
  stepX: { body: 7, leg: -18, foot: -10, leftArm: -3, rightArm: 3 },
  stepY: { body: -7.2, leg: -11, foot: -9, leftArm: 2.4, rightArm: -2.4 },
  windMultiplier: 2,
  // the first reference (emblem-walk-20261003) step coefficients, for the 2x proof
  v1StepX: { body: 3.5, leg: -9, foot: -5, leftArm: -1.5, rightArm: 1.5 },
  v1StepY: { body: -1.8, leg: -5.5, foot: -2.5, leftArm: 1.2, rightArm: -1.2 },
  v1WindMultiplier: 1,
} as const;

// Face/neck rigid box and its translation at peak step (source px).
export const FACE = { x0: 559, y0: 232, x1: 634, y1: 362, dx: 7, dy: -7.2 } as const;

export const GROUND_MAX_RED = 24; // red <= 24 (0..255) is non-line ground -> flat ink
export const INK = { r: 12, g: 10, b: 30 } as const;

// smoothstep over [a,b]
export function sm(a: number, b: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
// anisotropic gaussian
export function gauss(x: number, y: number, cx: number, cy: number, sx: number, sy: number): number {
  return Math.exp(-0.5 * ((x - cx) ** 2 / sx ** 2 + (y - cy) ** 2 / sy ** 2));
}

// The nine region fields and the head-blend weight at (xx,yy) in 1024 space.
export function fields(xx: number, yy: number) {
  const body = sm(370, 535, xx) * sm(260, 350, yy) * (1 - sm(930, 970, yy));
  const leg = gauss(xx, yy, 690, 814, 75, 115) * sm(540, 610, yy);
  const foot = gauss(xx, yy, 747, 893, 48, 41);
  const armLeft = gauss(xx, yy, 440, 575, 40, 65);
  const armRight = gauss(xx, yy, 736, 548, 45, 45);
  const hair = gauss(xx, yy, 440, 355, 112, 76) * (1 - sm(540, 575, xx)) * (1 - sm(431, 450, yy));
  const topDrape = gauss(xx, yy, 405, 187, 300, 97) * (1 - sm(283, 338, yy));
  const leftDrape = gauss(xx, yy, 240, 447, 126, 120) * (1 - sm(446, 513, xx));
  const lowerDrape = gauss(xx, yy, 297, 702, 185, 155) * (1 - sm(468, 537, xx)) * sm(503, 565, yy);
  // head-blend: 1 inside the face box, feathered 18 px outside it. At head==1 the
  // step becomes the uniform FACE translation and both wind fields are multiplied
  // by (1-head)==0, so the whole face region translates rigidly with no warp.
  const head =
    (1 - sm(0, 18, Math.max(FACE.x0 - xx, xx - FACE.x1, 0))) *
    (1 - sm(0, 18, Math.max(FACE.y0 - yy, yy - FACE.y1, 0)));
  return { body, leg, foot, armLeft, armRight, hair, topDrape, leftDrape, lowerDrape, head };
}

// Phase scalars from the 0..1 warp progress t. sin(pi t)^2 gives one lift with a
// single landing and soft ease at both ends; the two wind phases are 90 deg apart.
export function phases(t: number) {
  const phase = 2 * Math.PI * t;
  return {
    step: Math.sin(Math.PI * t) ** 2,
    windA: Math.sin(phase),
    windB: 0.5 * (1 - Math.cos(phase)),
  };
}

// Total apparent displacement (source px) at (xx,yy) for the given phase scalars.
// The sampler reads the emblem at (pixel - displacement). Returns {dx,dy}.
export function displacement(
  xx: number,
  yy: number,
  p: { step: number; windA: number; windB: number }
): { dx: number; dy: number } {
  const f = fields(xx, yy);
  const sX = V2.stepX, sY = V2.stepY;
  let sx = sX.body * f.body + sX.leg * f.leg + sX.foot * f.foot + sX.leftArm * f.armLeft + sX.rightArm * f.armRight;
  let sy = sY.body * f.body + sY.leg * f.leg + sY.foot * f.foot + sY.leftArm * f.armLeft + sY.rightArm * f.armRight;
  // blend into the rigid head/neck translation
  sx = sx * (1 - f.head) + FACE.dx * f.head;
  sy = sy * (1 - f.head) + FACE.dy * f.head;
  const m = V2.windMultiplier * (1 - f.head);
  const dxWindA = m * (-3.7 * f.hair - 2.3 * f.topDrape - 2.5 * f.leftDrape - 3.1 * f.lowerDrape);
  const dyWindA = m * (4.0 * f.hair + 3.4 * f.topDrape + 3.1 * f.leftDrape + 4.4 * f.lowerDrape);
  const dxWindB = m * (1.5 * f.hair + 1.1 * f.topDrape - 1.5 * f.leftDrape + 1.3 * f.lowerDrape);
  const dyWindB = m * (-1.5 * f.hair + 1.4 * f.topDrape - 1.2 * f.leftDrape + 1.9 * f.lowerDrape);
  return {
    dx: sx * p.step + dxWindA * p.windA + dxWindB * p.windB,
    dy: sy * p.step + dyWindA * p.windA + dyWindB * p.windB,
  };
}

export function inFaceBox(xx: number, yy: number): boolean {
  return xx > FACE.x0 && xx < FACE.x1 && yy > FACE.y0 && yy < FACE.y1;
}
