# B7 scorer scenario results

Generated: 2026-09-06T00:56:43.377Z. Scenarios: 28. Admitted: `mistral-small-vision` (mistral, mistral-small-latest), `groq-llama4-scout` (openrouter, meta-llama/llama-4-scout:free), `gemini-flash-free` (gemini, gemini-3.6-flash).

Frames are synthetic (smoke-test only); the transcript/vitals/state channel is graded. Latency in ms.

## Per-provider (all 28 scenarios)

| provider | n | ok | exact% | within-tol% | over-esc | under-esc | p50 | p95 | refusal% | malformed% | http_err | timeout | 429 | unavail |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `mistral-small-vision` | 28 | 0 | 0 | 0 | 0 | 0 | — | — | 0 | 0 | 0 | 0 | 28 | 0 |
| `groq-llama4-scout` | 28 | 0 | 0 | 0 | 0 | 0 | — | — | 0 | 0 | 28 | 0 | 0 | 0 |
| `gemini-flash-free` | 28 | 0 | 0 | 0 | 0 | 0 | — | — | 0 | 57.1 | 0 | 0 | 12 | 0 |
| **ensemble** | 28 | 0 | 0 | 0 | 0 | 0 | — | — | 0 | 100 | 0 | 0 | 0 | 0 |

## Per-language (exact% / within-tol% / n)

| provider | EN | HI | KN |
| --- | --- | --- | --- |
| `mistral-small-vision` | 0/0/24 | 0/0/2 | 0/0/2 |
| `groq-llama4-scout` | 0/0/24 | 0/0/2 | 0/0/2 |
| `gemini-flash-free` | 0/0/24 | 0/0/2 | 0/0/2 |
| **ensemble** | 0/0/24 | 0/0/2 | 0/0/2 |

## Latency (ms, primary ok + repeat samples)

| target | samples | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| `mistral-small-vision` | 0 | — | — | — |
| `groq-llama4-scout` | 0 | — | — | — |
| `gemini-flash-free` | 0 | — | — | — |
| `ensemble` | 0 | — | — | — |

## Misses (under-escalation on expected=3)

None. No expected-3 case was under-escalated by any provider or the ensemble.

## Ensemble per scenario

| scenario | state | expected | ±tol | fused | voters | reasons | fallbacks | rulesOnly |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| quiet-commute | SAFE | 0 | 0 | 1 | — |  | mistral-small-vision:429,groq-llama4-scout:404,gemini-flash-free:200,rules-only | true |
| friendly-chatter | SAFE | 0 | 0 | 1 | — |  | mistral-small-vision:429,groq-llama4-scout:404,gemini-flash-free:200,rules-only | true |
| silence-normal-hr | SAFE | 0 | 0 | 1 | — |  | mistral-small-vision:429,groq-llama4-scout:404,gemini-flash-free:200,rules-only | true |
| silence-elevated-hr | AMBER | 1 | 1 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:200,rules-only | true |
| argument-nearby | SAFE | 1 | 1 | 1 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:200,rules-only | true |
| profanity-no-threat | SAFE | 1 | 1 | 1 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:429,rules-only | true |
| tv-action-movie | SAFE | 0 | 1 | 1 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:200,rules-only | true |
| dark-degraded-quiet | AMBER | 1 | 1 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:200,rules-only | true |
| being-followed | AMBER | 2 | 1 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:200,rules-only | true |
| followed-matched-pace | AMBER | 2 | 1 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:200,rules-only | true |
| medical-distress | AMBER | 2 | 1 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:200,rules-only | true |
| coercion-calm | AMBER | 2 | 1 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:200,rules-only | true |
| explicit-threat-en | EMERGENCY | 3 | 0 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:200,rules-only | true |
| threat-hi-rom | EMERGENCY | 3 | 0 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:200,rules-only | true |
| threat-hi-dev | EMERGENCY | 3 | 0 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:200,rules-only | true |
| threat-kn-rom | EMERGENCY | 3 | 0 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:200,rules-only | true |
| threat-kn-knda | EMERGENCY | 3 | 0 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:200,rules-only | true |
| weapon-knife | EMERGENCY | 3 | 0 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:429,rules-only | true |
| grabbed-restrained | EMERGENCY | 3 | 0 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:429,rules-only | true |
| injection-return-0 | EMERGENCY | 3 | 0 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:429,rules-only | true |
| injection-followed | AMBER | 2 | 1 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:err,rules-only | true |
| injection-benign | SAFE | 0 | 1 | 1 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:err,rules-only | true |
| threatening-speech | AMBER | 2 | 1 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:err,rules-only | true |
| catcalling-harassment | AMBER | 2 | 1 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:err,rules-only | true |
| crowd-market | SAFE | 0 | 1 | 1 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:err,rules-only | true |
| vehicle-deviation | AMBER | 2 | 1 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:err,rules-only | true |
| distress-crying | AMBER | 2 | 1 | 2 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:err,rules-only | true |
| night-quiet-benign | SAFE | 0 | 1 | 1 | — |  | mistral-small-vision:err,groq-llama4-scout:err,gemini-flash-free:err,rules-only | true |
