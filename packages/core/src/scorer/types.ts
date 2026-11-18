// Free multi-model danger-scoring ensemble (ADR-020 / ADR-032).
// Providers vote a danger level; the ensemble fuses by max with budget-aware
// fallbacks. No Anthropic key is required — Claude only joins when explicitly
// enabled (CLAUDE_FALLBACK=on).

export type ProviderId =
  | 'mistral-small-vision'
  | 'groq-llama4-scout'
  | 'gemini-flash-free'
  | 'cloudflare-llama-vision'
  | 'claude-haiku-4-5'
  | 'claude-opus-5';

export type Danger = 0 | 1 | 2 | 3;

export interface ScoreInput {
  maskedFrameB64: string;
  transcript30s: string;
  vitals?: { hr?: number; hrv?: number };
  state: 'SAFE' | 'AMBER' | 'EMERGENCY' | 'CRITICAL';
  plateText?: string;
}

export interface ScoreResult {
  provider: ProviderId;
  danger: Danger;
  reasons: string[];
  latencyMs: number;
}

// A provider adapter. `score` throws an object carrying `{ status }` on a non-2xx
// response so the ensemble can classify (429 → backoff, others → skip).
export interface Scorer {
  id: ProviderId;
  score(i: ScoreInput, signal: AbortSignal): Promise<ScoreResult>;
}

export interface EnsembleOutcome {
  danger: Danger;
  votes: ScoreResult[];
  fallbacks: string[];
  rulesOnly: boolean;
}

export interface Deps {
  scorers: Scorer[];
  budget: ProviderBudget;
  claudeFallback: boolean;
  timeoutMs: number;
}

// Re-exported for `Deps`; the class lives in budget.ts.
import type { ProviderBudget } from './budget';
