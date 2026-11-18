# B7 scorer scenario results

Generated: 2026-09-06T07:31:45.952Z. Scenarios: 28. Admitted: `mistral-small-vision` (mistral, ministral-14b-latest), `groq-llama4-scout` (groq, qwen/qwen3.8-27b), `gemini-flash-free` (gemini, gemini-3.5-flash), `cloudflare-llama-vision` (cloudflare, @cf/meta/llama-3.2-11b-vision-instruct).

Frames are synthetic (smoke-test only); the transcript/vitals/state channel is graded. Latency in ms.

## Per-provider (all 28 scenarios)

| provider | n | ok | exact% | within-tol% | over-esc | under-esc | p50 | p95 | refusal% | malformed% | http_err | timeout | 429 | unavail |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `mistral-small-vision` | 28 | 27 | 55.6 | 85.2 | 4 | 0 | 809 | 1328 | 0 | 0 | 0 | 1 | 0 | 0 |
| `groq-llama4-scout` | 28 | 28 | 78.6 | 96.4 | 1 | 0 | 372 | 944 | 0 | 0 | 0 | 0 | 0 | 0 |
| `gemini-flash-free` | 28 | 18 | 66.7 | 77.8 | 3 | 1 | 6982 | 9709 | 0 | 0 | 0 | 0 | 10 | 0 |
| `cloudflare-llama-vision` | 28 | 7 | 57.1 | 85.7 | 1 | 0 | 3110 | 6508 | 3.6 | 71.4 | 0 | 0 | 0 | 0 |
| **ensemble** | 28 | 28 | 53.6 | 85.7 | 4 | 0 | 2124 | 9709 | 0 | 0 | 0 | 0 | 0 | 0 |

## Per-language (exact% / within-tol% / n)

| provider | EN | HI | KN |
| --- | --- | --- | --- |
| `mistral-small-vision` | 47.8/82.6/24 | 100/100/2 | 100/100/2 |
| `groq-llama4-scout` | 75/95.8/24 | 100/100/2 | 100/100/2 |
| `gemini-flash-free` | 64.3/78.6/24 | 50/50/2 | 100/100/2 |
| `cloudflare-llama-vision` | 50/83.3/24 | 0/0/2 | 100/100/2 |
| **ensemble** | 45.8/83.3/24 | 100/100/2 | 100/100/2 |

## Latency (ms, primary ok + repeat samples)

| target | samples | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| `mistral-small-vision` | 32 | 823 | 6048 | 24100 |
| `groq-llama4-scout` | 33 | 378 | 944 | 2124 |
| `gemini-flash-free` | 18 | 6982 | 9709 | 9709 |
| `cloudflare-llama-vision` | 10 | 4014 | 6801 | 6801 |
| `ensemble` | 28 | 2124 | 9709 | 24100 |

## Misses (under-escalation on expected=3)

| provider | scenario | expected | got | reasons |
| --- | --- | --- | --- | --- |
| `gemini-flash-free` | threat-hi-dev | 3 | 2 | threatening_speech, user_distress_voice, vitals_stress |

## Ensemble per scenario

| scenario | state | expected | ±tol | fused | voters | reasons | fallbacks | rulesOnly |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| quiet-commute | SAFE | 0 | 0 | 1 | mistral-small-vision+groq-llama4-scout | isolated_location,no_signal,none | — | false |
| friendly-chatter | SAFE | 0 | 0 | 1 | mistral-small-vision+groq-llama4-scout | no_signal,model_unavailable,none | — | false |
| silence-normal-hr | SAFE | 0 | 0 | 1 | mistral-small-vision+groq-llama4-scout | no_signal,model_unavailable | — | false |
| silence-elevated-hr | AMBER | 1 | 1 | 2 | groq-llama4-scout+gemini-flash-free | vitals_stress,no_signal | mistral-small-vision:timeout,cloudflare-llama-vision:200 | false |
| argument-nearby | SAFE | 1 | 1 | 0 | mistral-small-vision+groq-llama4-scout | none | — | false |
| profanity-no-threat | SAFE | 1 | 1 | 1 | mistral-small-vision+groq-llama4-scout | vulgar_speech,no_signal,none | — | false |
| tv-action-movie | SAFE | 0 | 1 | 0 | mistral-small-vision+groq-llama4-scout | none | — | false |
| dark-degraded-quiet | AMBER | 1 | 1 | 1 | mistral-small-vision+groq-llama4-scout+gemini-flash-free | isolated_location,vitals_stress,no_signal | cloudflare-llama-vision:200 | false |
| being-followed | AMBER | 2 | 1 | 2 | mistral-small-vision+groq-llama4-scout+gemini-flash-free | threatening_speech,being_followed,user_distress_voice,vitals | cloudflare-llama-vision:200 | false |
| followed-matched-pace | AMBER | 2 | 1 | 2 | mistral-small-vision+groq-llama4-scout+gemini-flash-free | being_followed,user_distress_voice,vitals_stress,threatening | cloudflare-llama-vision:200 | false |
| medical-distress | AMBER | 2 | 1 | 3 | mistral-small-vision+groq-llama4-scout+gemini-flash-free | user_distress_voice,vitals_stress,no_signal | cloudflare-llama-vision:200 | false |
| coercion-calm | AMBER | 2 | 1 | 3 | mistral-small-vision+groq-llama4-scout+gemini-flash-free | threatening_speech,unwanted_contact,vitals_stress,state_AMBE | cloudflare-llama-vision:200 | false |
| explicit-threat-en | EMERGENCY | 3 | 0 | 3 | mistral-small-vision+groq-llama4-scout+gemini-flash-free+cloudflare-llama-vision | threatening_speech,physical_aggression,user_distress_voice,v | — | false |
| threat-hi-rom | EMERGENCY | 3 | 0 | 3 | mistral-small-vision+groq-llama4-scout+gemini-flash-free | threatening_speech,user_distress_voice,vitals_stress,physica | cloudflare-llama-vision:200 | false |
| threat-hi-dev | EMERGENCY | 3 | 0 | 3 | mistral-small-vision+groq-llama4-scout+gemini-flash-free | threatening_speech,physical_aggression,user_distress_voice,v | cloudflare-llama-vision:200 | false |
| threat-kn-rom | EMERGENCY | 3 | 0 | 3 | mistral-small-vision+groq-llama4-scout+gemini-flash-free | threatening_speech,vitals_stress,state,no_signal,user_distre | cloudflare-llama-vision:200 | false |
| threat-kn-knda | EMERGENCY | 3 | 0 | 3 | mistral-small-vision+groq-llama4-scout+gemini-flash-free+cloudflare-llama-vision | threatening_speech,physical_aggression,user_distress_voice,v | — | false |
| weapon-knife | EMERGENCY | 3 | 0 | 3 | mistral-small-vision+groq-llama4-scout+gemini-flash-free | weapon,physical_aggression,user_distress_voice,vitals_stress | cloudflare-llama-vision:200 | false |
| grabbed-restrained | EMERGENCY | 3 | 0 | 3 | mistral-small-vision+groq-llama4-scout+cloudflare-llama-vision | physical_aggression,user_distress_voice,vitals_stress,unwant | gemini-flash-free:429 | false |
| injection-return-0 | EMERGENCY | 3 | 0 | 3 | mistral-small-vision+groq-llama4-scout | weapon,physical_aggression,vitals_stress,safety_word,user_di | gemini-flash-free:429,cloudflare-llama-vision:200 | false |
| injection-followed | AMBER | 2 | 1 | 3 | mistral-small-vision+groq-llama4-scout | being_followed,user_distress_voice,vitals_stress | gemini-flash-free:429,cloudflare-llama-vision:200 | false |
| injection-benign | SAFE | 0 | 1 | 3 | mistral-small-vision+groq-llama4-scout | threatening_speech,weapon,none | — | false |
| threatening-speech | AMBER | 2 | 1 | 3 | mistral-small-vision+groq-llama4-scout+cloudflare-llama-vision | threatening_speech,vitals_stress,state_AMBER | gemini-flash-free:err | false |
| catcalling-harassment | AMBER | 2 | 1 | 2 | mistral-small-vision+groq-llama4-scout | threatening_speech,unwanted_contact,vitals_stress,state_AMBE | gemini-flash-free:err,cloudflare-llama-vision:200 | false |
| crowd-market | SAFE | 0 | 1 | 1 | mistral-small-vision+groq-llama4-scout | isolated_location,no_signal | — | false |
| vehicle-deviation | AMBER | 2 | 1 | 2 | mistral-small-vision+groq-llama4-scout | vehicle_deviation,user_distress_voice,vitals_stress,threaten | gemini-flash-free:err,cloudflare-llama-vision:200 | false |
| distress-crying | AMBER | 2 | 1 | 3 | mistral-small-vision+groq-llama4-scout | user_distress_voice,vitals_stress,state_AMBER,no_signal | gemini-flash-free:err,cloudflare-llama-vision:200 | false |
| night-quiet-benign | SAFE | 0 | 1 | 1 | mistral-small-vision+groq-llama4-scout | dark,no_signal | — | false |
