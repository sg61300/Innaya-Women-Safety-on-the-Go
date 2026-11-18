import { ProviderBudget, type ProviderId, type Scorer } from "@vaira/core";
import { mistralScorer } from "./mistral";
import { groqScorer, resolveLlamaRoute } from "./groq";
import { geminiScorer } from "./gemini";
import { cloudflareScorer } from "./cloudflare";
import { claudeScorer } from "./claude";

// Free-tier limits (ADR-020). A voter is skipped at 90% of any limit (see ProviderBudget).
// mistral-small-vision: verified live 2026-09-06 for the ministral-14b-latest default
// (mistral.ts), x-ratelimit-limit-req-minute: 30 (was 60, for the old mistral-small-latest).
// gemini-flash-free: verified live 2026-09-06, the free tier is a PER-MODEL DAILY cap of
// 20 requests (GenerateRequestsPerDayPerProjectPerModel-FreeTier), not 1500 (lane F fix).
const LIMITS: Record<ProviderId, { rpm: number; rpd: number }> = {
  "mistral-small-vision": { rpm: 30, rpd: 100000 },
  "groq-llama4-scout": { rpm: 30, rpd: 14400 },
  "gemini-flash-free": { rpm: 15, rpd: 20 },
  // cloudflare-llama-vision (Q3, lane F2): free tier is 10,000 neurons/day and a
  // score costs ≈ 7.95 neurons (live probe), so ≈ 1258 scores/day. No per-minute
  // header was observed; rpm is set generously (unverified) since the neuron/day
  // cap is the real binding limit, verify rpm once under sustained live load.
  "cloudflare-llama-vision": { rpm: 60, rpd: 1258 },
  "claude-haiku-4-5": { rpm: 50, rpd: 1e9 },
  "claude-opus-5": { rpm: 50, rpd: 1e9 },
};

export function defaultBudget(now?: () => number): ProviderBudget {
  return new ProviderBudget(LIMITS, now);
}

// Builds the voter list from configured keys. Groq's slot falls back to
// OpenRouter/SambaNova when GROQ_API_KEY is empty (session 06 ruling).
export function buildScorers(env: NodeJS.ProcessEnv = process.env): Scorer[] {
  const scorers: Scorer[] = [];
  if (env.MISTRAL_API_KEY) scorers.push(mistralScorer(env.MISTRAL_API_KEY));
  const llama = resolveLlamaRoute(env);
  if (llama) scorers.push(groqScorer(llama));
  if (env.GEMINI_API_KEY) scorers.push(geminiScorer(env.GEMINI_API_KEY));
  if (env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID)
    scorers.push(cloudflareScorer(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN));
  if (env.CLAUDE_FALLBACK === "on" && env.ANTHROPIC_API_KEY) {
    scorers.push(claudeScorer("claude-haiku-4-5", env.ANTHROPIC_API_KEY));
    scorers.push(claudeScorer("claude-opus-5", env.ANTHROPIC_API_KEY));
  }
  return scorers;
}

export function claudeFallbackOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CLAUDE_FALLBACK === "on" && !!env.ANTHROPIC_API_KEY;
}
