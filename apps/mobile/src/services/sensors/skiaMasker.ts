// Task 26b: the real on-device masker. Composes detection -> plate read ->
// mask plan -> raster, and registers itself as the active gate. If detection is
// unavailable it still masks via `heavyBlurPlan`; if the raster (Skia) is
// unavailable `applyMask` throws and the gate BLOCKS the upload (ADR-019/R36).
// Importing this module for its side effect swaps the NoopMasker for this one.
import { detect } from "./detect";
import { planMask, heavyBlurPlan, applyMask } from "./mask";
import { readPlate } from "./plate";
import { setMasker, type Masker, type MaskResult } from "./masker";

export const skiaMasker: Masker = {
  async maskFrame(frameUri, dims): Promise<MaskResult> {
    const d = await detect(frameUri).catch(() => null);
    const plate = d ? readPlate(d.textValues) : null;
    const plan = d ? planMask(d, dims) : heavyBlurPlan(dims);
    // H1: applyMask returns the RAW base64 JPEG body (not a `data:` URL). The
    // camera loop decodes it to bytes for the storage upload and forwards it to
    // /api/analyze — no `fetch(data:)` round-trip (unsupported by native fetch).
    const base64 = await applyMask(frameUri, plan); // throws if Skia absent -> blocks upload
    return { base64, plateText: plate, counts: plan.counts, degraded: !d };
  },
};

setMasker(skiaMasker);
