import type { DangerScore } from "./types";
export function fuseScore(ruleScore: DangerScore, modelScore: DangerScore | null): DangerScore {
  const m: DangerScore = modelScore ?? 1;
  return (ruleScore > m ? ruleScore : m);
}
