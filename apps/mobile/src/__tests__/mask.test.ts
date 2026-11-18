// Task 26b (ADR-019): masking plan invariants. Pure — no native runtime.
import { planMask, heavyBlurPlan } from "../services/sensors/mask";

const frame = { w: 640, h: 480 };

test("wearer face fully pixelated, others eyes-and-above", () => {
  const p = planMask(
    {
      faces: [
        { x: 250, y: 300, w: 140, h: 160, eyeY: 360 },
        { x: 40, y: 60, w: 100, h: 120, eyeY: 100 },
      ],
      text: [],
      textValues: [],
      wearerIndex: 0,
    },
    frame
  );
  expect(p.regions[0]).toEqual({ box: { x: 250, y: 300, w: 140, h: 160 }, style: "pixel16" });
  // eyeY 100 + 0.15*120 = 118 -> h = 118 - 60 = 58
  expect(p.regions[1]).toEqual({ box: { x: 40, y: 60, w: 100, h: 58 }, style: "pixel16" });
  expect(p.counts).toEqual({ facesTotal: 2, facesFull: 1, facesEyes: 1, textBoxes: 0 });
});

test("text boxes are fully blurred", () => {
  const p = planMask(
    { faces: [], text: [{ x: 10, y: 400, w: 200, h: 40 }], textValues: [], wearerIndex: null },
    frame
  );
  expect(p.regions).toEqual([{ box: { x: 10, y: 400, w: 200, h: 40 }, style: "blur" }]);
});

test("no wearer detected: all faces fully pixelated (fail-safe)", () => {
  const p = planMask(
    { faces: [{ x: 0, y: 0, w: 50, h: 60, eyeY: 20 }], text: [], textValues: [], wearerIndex: null },
    frame
  );
  expect(p.regions[0].box.h).toBe(60);
  expect(p.counts.facesFull).toBe(1);
});

test("heavyBlurPlan masks the entire frame as one blur region (B3 fail-safe)", () => {
  for (const f of [{ w: 640, h: 100 }, { w: 640, h: 480 }]) {
    const p = heavyBlurPlan(f);
    expect(p.regions).toEqual([{ box: { x: 0, y: 0, w: f.w, h: f.h }, style: "blur" }]);
    expect(p.counts).toEqual({ facesTotal: 0, facesFull: 0, facesEyes: 0, textBoxes: 0 });
  }
});

test("eyes band clamps to the full box when the eye line is above the face (B3)", () => {
  const p = planMask(
    {
      faces: [
        { x: 250, y: 300, w: 140, h: 160, eyeY: 320 }, // wearer -> full
        { x: 40, y: 60, w: 100, h: 120, eyeY: 20 }, // non-wearer, eyeY above box top
      ],
      text: [],
      textValues: [],
      wearerIndex: 0,
    },
    frame
  );
  // eyeY 20 + 0.15*120 = 38; 38 - 60 = -22 -> clamped to 0 -> full-box fallback
  expect(p.regions[1].box.h).toBe(120);
  expect(p.regions[1].style).toBe("pixel16");
  expect(p.counts.facesFull).toBe(2);
  expect(p.counts.facesEyes).toBe(0);
});

test("eyes band clamps to full box height when the eye line is far below (B3)", () => {
  const p = planMask(
    { faces: [{ x: 40, y: 60, w: 100, h: 120, eyeY: 400 }], text: [], textValues: [], wearerIndex: 1 },
    frame
  );
  // non-wearer; eyeY 400 + 18 - 60 = 358 -> clamped to f.h = 120
  expect(p.regions[0].box.h).toBe(120);
  expect(p.counts.facesEyes).toBe(1);
});
