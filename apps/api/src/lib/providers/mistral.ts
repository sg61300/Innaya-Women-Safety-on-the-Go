import type { ScoreInput, ScoreResult, Scorer } from "@vaira/core";
import { openaiVisionScore } from "./shared";

// Mistral vision voter via the OpenAI-compatible chat/completions endpoint.
// The founder's Free plan has a PER-MODEL 429: mistral-small-latest returns
// x-ratelimit-limit-req-minute:0 (code 1300), while the ministral vision models are
// live (lane F probe, 2026-09-06): ministral-14b-latest = 30 req/min, ministral-8b
// = 188 req/min. Default is ministral-14b-latest (limit>0, returns valid JSON on a
// frame+transcript call, exact on the probe). Env MISTRAL_MODEL overrides.
export function mistralScorer(apiKey: string): Scorer {
  const model = process.env.MISTRAL_MODEL ?? "ministral-14b-latest";
  return {
    id: "mistral-small-vision",
    async score(i: ScoreInput, signal: AbortSignal): Promise<ScoreResult> {
      const t0 = Date.now();
      const { danger, reasons } = await openaiVisionScore({
        url: "https://api.mistral.ai/v1/chat/completions",
        apiKey,
        model,
        input: i,
        signal,
      });
      return { provider: "mistral-small-vision", danger, reasons, latencyMs: Date.now() - t0 };
    },
  };
}
