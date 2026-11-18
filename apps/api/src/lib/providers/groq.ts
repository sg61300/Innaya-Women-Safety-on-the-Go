import type { ScoreInput, ScoreResult, Scorer } from "@vaira/core";
import { openaiVisionScore } from "./shared";

// Fast voter (ADR-020 SAFE tier). The ensemble provider id stays `groq-llama4-scout`
// for the frozen core voter set, even though the underlying model changed.
//
// Two routes (ADR-032 amendment, lane F, 2026-09-06):
//  - GROQ_API_KEY present → direct Groq. Groq has NO vision-capable model on this
//    account (list: gpt-oss-*, qwen3.x-27b, whisper-*, ...), so this route is an
//    AUDIO-CHANNEL voter: transcript/vitals/state only, no image (`omitImage`).
//    Default `qwen/qwen3.8-27b`, the one candidate that returned valid scoring JSON
//    reliably in a live 3-scenario probe (gpt-oss-20b/120b HTTP-400'd json_object).
//  - GROQ_API_KEY empty → OpenRouter free VISION slug (image capable), then SambaNova.
//    OpenRouter's `meta-llama/llama-4-scout:free` was retired (404, B7 run); the
//    default/fallbacks are free vision slugs from GET /api/v1/models, fallbacks tried
//    ONLY on 404/410 (retired slug), never on 429/5xx.
type Route = {
  url: string;
  apiKey: string;
  model: string;
  fallbackModels?: string[];
  extraHeaders?: Record<string, string>;
  omitImage?: boolean;
};

// Free vision slugs observed live on OpenRouter GET /api/v1/models + tested with a
// real scoring call on 2026-09-06. The Gemma-class models are the nominal best-class
// pick but their Google-AI-Studio shared free pool was 429-saturated at test time
// ("temporarily rate-limited upstream", limit_source: upstream_provider_shared_pool),
// which the 404/410-only fallback deliberately does NOT mask. minimax-m3 (1M-ctx
// vision MoE) was the one free slug returning valid scoring JSON, so it is the
// default; the Gemma slugs are the 404/410 fallback chain. Env OPENROUTER_LLAMA_MODEL
// overrides the primary. See fix-providers-b7-report.md for the observed list.
const OPENROUTER_VISION_DEFAULT = "minimax/minimax-m3:free";
const OPENROUTER_VISION_FALLBACKS = ["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free"];

export function resolveLlamaRoute(env: NodeJS.ProcessEnv = process.env): Route | null {
  if (env.GROQ_API_KEY) {
    return {
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_MODEL ?? "qwen/qwen3.8-27b",
      omitImage: true, // Groq has no vision model: audio-channel voter (ADR-032 amendment)
    };
  }
  if (env.OPENROUTER_API_KEY) {
    const primary = env.OPENROUTER_LLAMA_MODEL ?? OPENROUTER_VISION_DEFAULT;
    return {
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: env.OPENROUTER_API_KEY,
      model: primary,
      // Don't retry into a slug identical to the (overridden) primary.
      fallbackModels: OPENROUTER_VISION_FALLBACKS.filter((m) => m !== primary),
      extraHeaders: { "HTTP-Referer": process.env.APP_BASE_URL ?? "https://vaira.app", "X-Title": "INNAYA" },
    };
  }
  if (env.SAMBANOVA_API_KEY) {
    return {
      url: "https://api.sambanova.ai/v1/chat/completions",
      apiKey: env.SAMBANOVA_API_KEY,
      model: env.SAMBANOVA_LLAMA_MODEL ?? "Llama-4-Scout-17B-16E-Instruct",
    };
  }
  return null;
}

// A retired/unknown model slug returns 404 (or 410). Only those justify trying the
// next slug; 429 (rate limit) and 5xx (transient) must NOT burn the fallback chain.
const isSlugGone = (status: unknown) => status === 404 || status === 410;

export function groqScorer(route: Route): Scorer {
  return {
    id: "groq-llama4-scout",
    async score(i: ScoreInput, signal: AbortSignal): Promise<ScoreResult> {
      const t0 = Date.now();
      const models = [route.model, ...(route.fallbackModels ?? [])];
      let lastErr: unknown;
      for (const model of models) {
        try {
          const { danger, reasons } = await openaiVisionScore({
            url: route.url,
            apiKey: route.apiKey,
            model,
            input: i,
            signal,
            extraHeaders: route.extraHeaders,
            omitImage: route.omitImage,
          });
          return { provider: "groq-llama4-scout", danger, reasons, latencyMs: Date.now() - t0 };
        } catch (e: any) {
          lastErr = e;
          if (isSlugGone(e?.status)) continue; // retired slug: try the next one
          throw e; // 429/5xx/parse: surface to the ensemble unchanged
        }
      }
      throw lastErr; // every slug 404/410
    },
  };
}
