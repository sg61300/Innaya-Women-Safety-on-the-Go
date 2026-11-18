import { phases, displacement, fields, inFaceBox, FACE, V2 } from "../lib/splashWarp";

// The warp math is the single source of truth mirrored by the SkSL shader in
// SplashSequence.tsx. These tests prove the properties the founder's reference
// rig guarantees: rest == still at both ends, the face is rigid (translate only,
// never warped), the ring/star pins are left to the shader mask, and the figure
// moves at roughly 2x the first reference. The GPU composite itself is proved on
// the spec render and on device; here we prove the displacement field.

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

test("rest == still: zero displacement at t=0 and t=1 everywhere", () => {
  for (const t of [0, 1]) {
    const p = phases(t);
    expect(near(p.step, 0)).toBe(true);
    expect(near(p.windA, 0)).toBe(true);
    expect(near(p.windB, 0)).toBe(true);
    // sample a spread of points across the figure
    for (const [x, y] of [[450, 300], [690, 814], [747, 893], [440, 355], [297, 702], [596, 300]]) {
      const d = displacement(x, y, p);
      expect(near(d.dx, 0)).toBe(true);
      expect(near(d.dy, 0)).toBe(true);
    }
  }
});

test("phases follow sin(pi t)^2 and the 90-deg wind pair; step peaks at t=0.5", () => {
  expect(near(phases(0.5).step, 1)).toBe(true);
  expect(phases(0.25).step).toBeGreaterThan(0);
  expect(phases(0.5).step).toBeGreaterThan(phases(0.25).step);
});

test("face region is RIGID: one uniform translation, never warped", () => {
  const p = phases(0.5); // peak step
  // several interior face points must share the exact same displacement vector
  const pts: Array<[number, number]> = [];
  for (let x = FACE.x0 + 6; x < FACE.x1 - 6; x += 12)
    for (let y = FACE.y0 + 6; y < FACE.y1 - 6; y += 12) pts.push([x, y]);
  expect(pts.length).toBeGreaterThan(10);
  const d0 = displacement(pts[0][0], pts[0][1], p);
  for (const [x, y] of pts) {
    expect(inFaceBox(x, y)).toBe(true);
    const d = displacement(x, y, p);
    // identical across the whole face (variance 0) => rigid, not warped
    expect(near(d.dx, d0.dx)).toBe(true);
    expect(near(d.dy, d0.dy)).toBe(true);
    // and equal to the pure face translation scaled by step
    expect(near(d.dx, FACE.dx * p.step)).toBe(true);
    expect(near(d.dy, FACE.dy * p.step)).toBe(true);
  }
  // head weight is exactly 1 inside the box (drives the rigid blend)
  expect(near(fields(596, 300).head, 1)).toBe(true);
});

test("figure step is ~2x the first reference, with an even stronger vertical lift", () => {
  // every horizontal step coefficient and the wind are exactly doubled from v1
  expect(V2.stepX.body).toBeCloseTo(2 * V2.v1StepX.body, 10);
  expect(V2.stepX.leg).toBeCloseTo(2 * V2.v1StepX.leg, 10);
  expect(V2.stepX.foot).toBeCloseTo(2 * V2.v1StepX.foot, 10);
  expect(V2.stepX.leftArm).toBeCloseTo(2 * V2.v1StepX.leftArm, 10);
  expect(V2.stepX.rightArm).toBeCloseTo(2 * V2.v1StepX.rightArm, 10);
  expect(V2.windMultiplier).toBe(2 * V2.v1WindMultiplier);
  // the vertical lift of the torso and foot is boosted BEYOND 2x so the lift reads
  // clearly (founder: "the figure's lift visible", "doubled step with foot lift")
  expect(V2.stepY.body / V2.v1StepY.body).toBeCloseTo(4, 6);
  expect(V2.stepY.foot / V2.v1StepY.foot).toBeGreaterThan(3);
  expect(V2.stepY.leg / V2.v1StepY.leg).toBeCloseTo(2, 6);

  // realized horizontal displacement at a leg point is ~2x a v1-constant recompute
  const f = fields(690, 814);
  const v2dx = V2.stepX.body * f.body + V2.stepX.leg * f.leg + V2.stepX.foot * f.foot;
  const v1dx = V2.v1StepX.body * f.body + V2.v1StepX.leg * f.leg + V2.v1StepX.foot * f.foot;
  expect(v2dx / v1dx).toBeCloseTo(2, 6);
  // the leg actually lifts a meaningful amount at peak (not a token nudge)
  const d = displacement(690, 814, phases(0.5));
  expect(Math.hypot(d.dx, d.dy)).toBeGreaterThan(6);
});

test("the foot lands back exactly where it started (loop-free rest)", () => {
  const a = displacement(747, 893, phases(0));
  const b = displacement(747, 893, phases(1));
  expect(near(a.dx, b.dx)).toBe(true);
  expect(near(a.dy, b.dy)).toBe(true);
  expect(near(a.dx, 0)).toBe(true);
});
