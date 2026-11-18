// Task 26b (ADR-019): on-device frame masking BEFORE upload.
// wearer face -> full pixelate; other faces -> eyes-and-above pixelate;
// text boxes -> blur. `planMask` / `heavyBlurPlan` are pure and unit-tested;
// `applyMask` is the raster op (lazy-loads @shopify/react-native-skia so this
// module stays importable — and testable — without the native runtime).

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface FaceDet extends Box {
  eyeY: number; // absolute px, y of the eye line
}
export interface Detections {
  faces: FaceDet[];
  text: Box[];
  textValues: { box: Box; value: string }[];
  wearerIndex: number | null;
}
export interface MaskRegion {
  box: Box;
  style: "pixel16" | "blur";
}
export interface MaskPlan {
  regions: MaskRegion[];
  counts: { facesTotal: number; facesFull: number; facesEyes: number; textBoxes: number };
}

// Pure. face i: if it is the wearer (or no wearer was identified -> fail safe)
// the whole face box is pixelated; otherwise only from the top of the box down
// to just below the eye line (eyeY + 15% of face height). Every text box is
// blurred. Faces are planned before text so region order is deterministic.
export function planMask(d: Detections, _frame: { w: number; h: number }): MaskPlan {
  const regions: MaskRegion[] = [];
  let facesFull = 0;
  let facesEyes = 0;
  d.faces.forEach((f, i) => {
    const full = d.wearerIndex === null || i === d.wearerIndex;
    if (full) {
      regions.push({ box: { x: f.x, y: f.y, w: f.w, h: f.h }, style: "pixel16" });
      facesFull++;
    } else {
      // Clamp the eyes-and-above band to [0, f.h]: a bad landmark can put eyeY
      // above the box (negative height -> region not drawn -> face leaks) or far
      // below it (height past the box). If it collapses to 0, mask the whole box.
      const h = Math.min(f.h, Math.max(0, Math.round(f.eyeY + 0.15 * f.h - f.y)));
      if (h === 0) {
        regions.push({ box: { x: f.x, y: f.y, w: f.w, h: f.h }, style: "pixel16" });
        facesFull++;
      } else {
        regions.push({ box: { x: f.x, y: f.y, w: f.w, h }, style: "pixel16" });
        facesEyes++;
      }
    }
  });
  for (const t of d.text) {
    regions.push({ box: { x: t.x, y: t.y, w: t.w, h: t.h }, style: "blur" });
  }
  return {
    regions,
    counts: { facesTotal: d.faces.length, facesFull, facesEyes, textBoxes: d.text.length },
  };
}

// Fail-safe used when detection is unavailable/failed: blur the ENTIRE frame as
// one region. A degraded frame is masked completely — the scorer gets no context
// rather than any raw pixels (ADR-019). The previous "keep a centre band" plan
// leaked a raw band, and for frames shorter than the band leaked the whole frame.
export function heavyBlurPlan(frame: { w: number; h: number }): MaskPlan {
  const regions: MaskRegion[] = [
    { box: { x: 0, y: 0, w: frame.w, h: frame.h }, style: "blur" },
  ];
  return { regions, counts: { facesTotal: 0, facesFull: 0, facesEyes: 0, textBoxes: 0 } };
}

// Device-only raster (R32: not verifiable on the emulator by this lane). Draws
// the frame onto an offscreen Skia surface and re-draws each region either
// pixelated (nearest-neighbour downscale) or blurred, then re-encodes JPEG.
// Throws if Skia is not present so callers BLOCK upload rather than send raw px.
export async function applyMask(frameUri: string, plan: MaskPlan): Promise<string> {
  // G1b (s17): read enums from the package TOP LEVEL, never off the `Skia` object.
  // In @shopify/react-native-skia `ImageFormat` and `ClipOp` are top-level enum
  // exports; the native `Skia` runtime object does NOT carry them, so `Skia.ImageFormat`
  // / `Skia.ClipOp` are `undefined` on Hermes and reading `.JPEG` / `.Intersect` off
  // them threw "Cannot read property 'JPEG'/'Intersect' of undefined" — every
  // monitoring frame failed to mask and never reached the scorer.
  const { Skia, ImageFormat, ClipOp } = requireSkiaModule();
  const data = await Skia.Data.fromURI(frameUri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error("skia: could not decode frame");
  const w = image.width();
  const h = image.height();
  const surface = Skia.Surface.MakeOffscreen(w, h);
  if (!surface) throw new Error("skia: could not allocate surface");
  const canvas = surface.getCanvas();
  const src = Skia.XYWHRect(0, 0, w, h);
  canvas.drawImageRect(image, src, src, Skia.Paint());

  for (const r of plan.regions) {
    const rect = Skia.XYWHRect(r.box.x, r.box.y, r.box.w, r.box.h);
    const paint = Skia.Paint();
    if (r.style === "blur") {
      paint.setImageFilter(Skia.ImageFilter.MakeBlur(12, 12, 1 /* clamp */, null));
    } else {
      // pixel16 is a BLUR PLACEHOLDER for now: the current raster blurs the
      // region rather than pixelating it. True nearest-neighbour pixelation
      // (a real device raster) is an OPEN item for the Task 26b re-enable.
      paint.setImageFilter(
        Skia.ImageFilter.MakeBlur(6, 6, 1, null)
      );
    }
    canvas.save();
    canvas.clipRect(rect, ClipOp.Intersect, false); // ClipOp.Intersect === 1
    canvas.drawImageRect(image, rect, rect, paint);
    canvas.restore();
  }

  const snap = surface.makeImageSnapshot();
  const b64 = snap.encodeToBase64(ImageFormat.JPEG, 60); // ImageFormat.JPEG === 3
  // H1: return the RAW base64 body — never a `data:` URL. The caller decodes it to
  // bytes and uploads those directly. Android's native `fetch` cannot open a
  // `data:` URL (MalformedURLException: unknown protocol: data), so the old
  // round-trip `fetch(dataUri).blob()` failed every frame; this base64 also feeds
  // /api/analyze unchanged.
  return b64;
}

// Return the whole module namespace (not just `.Skia`) so callers can destructure
// the top-level enum exports (`ImageFormat`, `ClipOp`) alongside the `Skia` object.
function requireSkiaModule(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("@shopify/react-native-skia");
  } catch {
    throw new Error("masking unavailable: @shopify/react-native-skia not present");
  }
}
