// Task 26 / 26b (ADR-019, R36): the masking GATE. The camera loop calls the
// registered masker before every upload. Until an on-device masker is
// registered the gate is `NoopMasker`, which BLOCKS (throws) — a raw, unmasked
// frame is never uploaded. Task 26b registers the real Skia+ML-Kit masker.
import type { MaskPlan } from "./mask";

export interface MaskResult {
  // H1: the RAW base64 body of the masked JPEG. The camera decodes it to bytes for
  // the storage upload and forwards it to /api/analyze. It is NOT a `data:` URL —
  // Android's native fetch cannot open one, so we never round-trip through fetch.
  base64: string;
  plateText: string | null;
  counts: MaskPlan["counts"];
  degraded: boolean; // detection failed -> heavyBlurPlan used
}

export interface Masker {
  maskFrame(frameUri: string, dims: { w: number; h: number }): Promise<MaskResult>;
}

// Hard fail-closed default: no masker => no upload.
export const NoopMasker: Masker = {
  async maskFrame() {
    throw new Error(
      "upload blocked: on-device masking unavailable (ADR-019/R36) — refusing to upload an unmasked frame"
    );
  },
};

let active: Masker = NoopMasker;
export function setMasker(m: Masker) {
  active = m;
}
export function getMasker(): Masker {
  return active;
}
