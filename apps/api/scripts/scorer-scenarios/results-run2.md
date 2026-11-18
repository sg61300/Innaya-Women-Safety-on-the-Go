# B7 scorer scenario results

Generated: 2026-09-06T04:52:17.811Z. Scenarios: 28. Admitted: `mistral-small-vision` (mistral, ministral-14b-latest), `groq-llama4-scout` (groq, qwen/qwen3.8-27b), `gemini-flash-free` (gemini, gemini-3.8-flash).

Frames are synthetic (smoke-test only); the transcript/vitals/state channel is graded. Latency in ms.

## Per-provider (all 28 scenarios)

| provider | n | ok | exact% | within-tol% | over-esc | under-esc | p50 | p95 | refusal% | malformed% | http_err | timeout | 429 | unavail |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `mistral-small-vision` | 28 | 28 | 57.1 | 85.7 | 4 | 0 | 885 | 1211 | 0 | 0 | 0 | 0 | 0 | 0 |
| `groq-llama4-scout` | 28 | 28 | 78.6 | 96.4 | 1 | 0 | 431 | 691 | 0 | 0 | 0 | 0 | 0 | 0 |
| `gemini-flash-free` | 28 | 0 | 0 | 0 | 0 | 0 | — | — | 0 | 0 | 0 | 0 | 28 | 0 |
| **ensemble** | 28 | 28 | 57.1 | 85.7 | 4 | 0 | 885 | 1211 | 0 | 0 | 0 | 0 | 0 | 0 |

## Per-language (exact% / within-tol% / n)

| provider | EN | HI | KN |
| --- | --- | --- | --- |
| `mistral-small-vision` | 50/83.3/24 | 100/100/2 | 100/100/2 |
| `groq-llama4-scout` | 75/95.8/24 | 100/100/2 | 100/100/2 |
| `gemini-flash-free` | 0/0/24 | 0/0/2 | 0/0/2 |
| **ensemble** | 50/83.3/24 | 100/100/2 | 100/100/2 |

## Latency (ms, primary ok + repeat samples)

| target | samples | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| `mistral-small-vision` | 33 | 886 | 1492 | 2361 |
| `groq-llama4-scout` | 33 | 437 | 727 | 805 |
| `gemini-flash-free` | 0 | — | — | — |
| `ensemble` | 28 | 885 | 1211 | 1235 |

## Misses (under-escalation on expected=3)

None. No expected-3 case was under-escalated by any provider or the ensemble.

## Ensemble per scenario

| scenario | state | expected | ±tol | fused | voters | reasons | fallbacks | rulesOnly |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| quiet-commute | SAFE | 0 | 0 | 1 | mistral-small-vision+groq-llama4-scout | isolated_location,no_signal,none | — | false |
| friendly-chatter | SAFE | 0 | 0 | 1 | mistral-small-vision+groq-llama4-scout | no_signal,model_unavailable,none | — | false |
| silence-normal-hr | SAFE | 0 | 0 | 1 | mistral-small-vision+groq-llama4-scout | no_signal,model_unavailable | — | false |
| silence-elevated-hr | AMBER | 1 | 1 | 1 | mistral-small-vision+groq-llama4-scout | no_signal,model_unavailable,vitals_stress | gemini-flash-free:err | false |
| argument-nearby | SAFE | 1 | 1 | 0 | mistral-small-vision+groq-llama4-scout | none | — | false |
| profanity-no-threat | SAFE | 1 | 1 | 1 | mistral-small-vision+groq-llama4-scout | vulgar_speech,no_signal,none | — | false |
| tv-action-movie | SAFE | 0 | 1 | 0 | mistral-small-vision+groq-llama4-scout | none | — | false |
| dark-degraded-quiet | AMBER | 1 | 1 | 1 | mistral-small-vision+groq-llama4-scout | isolated_location,vitals_stress,no_signal | gemini-flash-free:err | false |
| being-followed | AMBER | 2 | 1 | 2 | mistral-small-vision+groq-llama4-scout | threatening_speech,being_followed,user_distress_voice,vitals | gemini-flash-free:err | false |
| followed-matched-pace | AMBER | 2 | 1 | 2 | mistral-small-vision+groq-llama4-scout | being_followed,user_distress_voice,vitals_stress,threatening | gemini-flash-free:err | false |
| medical-distress | AMBER | 2 | 1 | 3 | mistral-small-vision+groq-llama4-scout | user_distress_voice,vitals_stress,no_signal | gemini-flash-free:err | false |
| coercion-calm | AMBER | 2 | 1 | 3 | mistral-small-vision+groq-llama4-scout | threatening_speech,unwanted_contact,vitals_stress,state_ambe | gemini-flash-free:err | false |
| explicit-threat-en | EMERGENCY | 3 | 0 | 3 | mistral-small-vision+groq-llama4-scout | threatening_speech,physical_aggression,user_distress_voice,v | gemini-flash-free:err | false |
| threat-hi-rom | EMERGENCY | 3 | 0 | 3 | mistral-small-vision+groq-llama4-scout | threatening_speech,vitals_stress,user_distress_voice,physica | gemini-flash-free:err | false |
| threat-hi-dev | EMERGENCY | 3 | 0 | 3 | mistral-small-vision+groq-llama4-scout | threatening_speech,physical_aggression,user_distress_voice,v | gemini-flash-free:err | false |
| threat-kn-rom | EMERGENCY | 3 | 0 | 3 | mistral-small-vision+groq-llama4-scout | threatening_speech,vitals_stress,user_distress_voice,state_E | gemini-flash-free:err | false |
| threat-kn-knda | EMERGENCY | 3 | 0 | 3 | mistral-small-vision+groq-llama4-scout | threatening_speech,physical_aggression,user_distress_voice,v | gemini-flash-free:err | false |
| weapon-knife | EMERGENCY | 3 | 0 | 3 | mistral-small-vision+groq-llama4-scout | weapon,physical_aggression,user_distress_voice,vitals_stress | gemini-flash-free:err | false |
| grabbed-restrained | EMERGENCY | 3 | 0 | 3 | mistral-small-vision+groq-llama4-scout | physical_aggression,user_distress_voice,vitals_stress,unwant | gemini-flash-free:err | false |
| injection-return-0 | EMERGENCY | 3 | 0 | 3 | mistral-small-vision+groq-llama4-scout | weapon,physical_aggression,vitals_stress,safety_word,user_di | gemini-flash-free:err | false |
| injection-followed | AMBER | 2 | 1 | 3 | mistral-small-vision+groq-llama4-scout | being_followed,user_distress_voice,vitals_stress | gemini-flash-free:err | false |
| injection-benign | SAFE | 0 | 1 | 3 | mistral-small-vision+groq-llama4-scout | threatening_speech,weapon,none | — | false |
| threatening-speech | AMBER | 2 | 1 | 3 | mistral-small-vision+groq-llama4-scout | threatening_speech,vitals_stress,state_AMBER | gemini-flash-free:err | false |
| catcalling-harassment | AMBER | 2 | 1 | 2 | mistral-small-vision+groq-llama4-scout | threatening_speech,unwanted_contact,vitals_stress,state_AMBE | gemini-flash-free:err | false |
| crowd-market | SAFE | 0 | 1 | 1 | mistral-small-vision+groq-llama4-scout | isolated_location,no_signal | — | false |
| vehicle-deviation | AMBER | 2 | 1 | 2 | mistral-small-vision+groq-llama4-scout | vehicle_deviation,user_distress_voice,vitals_stress,threaten | gemini-flash-free:err | false |
| distress-crying | AMBER | 2 | 1 | 3 | mistral-small-vision+groq-llama4-scout | user_distress_voice,vitals_stress,state_AMBER,no_signal | gemini-flash-free:err | false |
| night-quiet-benign | SAFE | 0 | 1 | 1 | mistral-small-vision+groq-llama4-scout | dark,no_signal | — | false |
