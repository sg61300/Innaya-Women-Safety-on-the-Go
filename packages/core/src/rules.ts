import type { DangerScore } from "./types";
import { normaliseWord } from "./hash";
export const BUILTIN_TRIGGERS = ["help", "sos"] as const;
const COMMON = new Set(["safe","ok","okay","fine","i am ok","i am okay","i am fine","im ok","im fine","yes","no","good","all good","help","sos","police"]);
export function matchKeyword(transcript: string, words: string[]): string | null {
  const t = ` ${normaliseWord(transcript)} `;
  for (const w of words) { const n = normaliseWord(w); if (n && t.includes(` ${n} `)) return n; }
  return null;
}
export function isGuessableSafeWord(word: string, emergencyWords: string[]): { ok: boolean; reason?: "too_short"|"common"|"equals_emergency" } {
  const n = normaliseWord(word);
  if (n.length < 4) return { ok: false, reason: "too_short" };
  if (COMMON.has(n)) return { ok: false, reason: "common" };
  if (emergencyWords.some(e => normaliseWord(e) === n)) return { ok: false, reason: "equals_emergency" };
  return { ok: true };
}
export function hrRule(hr: number, baseline: number, sustainedSec: number): DangerScore {
  // Architecture/03: "> baseline + 35 bpm sustained 20 s, or > 140 bpm at rest" (strict >; "at rest" is not an input here)
  if (hr > 140) return 1;
  if (hr > baseline + 35 && sustainedSec >= 20) return 1;
  return 0;
}
