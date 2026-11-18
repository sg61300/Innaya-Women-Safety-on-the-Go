// Task 26b: read an Indian vehicle plate out of the OCR text boxes so the plate
// number can be logged (and blurred in the frame) before upload. Pure + tested.
import type { Box } from "./mask";

// Indian format after normalisation: 2 letters (state) + 1-2 digits (RTO) +
// 1-3 letters (series) + 4 digits. Spaces and hyphens are stripped first.
const PLATE_RE = /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/;

export function readPlate(text: { box: Box; value: string }[]): string | null {
  for (const t of text) {
    const norm = t.value.replace(/[\s-]/g, "").toUpperCase();
    if (PLATE_RE.test(norm)) return norm;
  }
  return null;
}
