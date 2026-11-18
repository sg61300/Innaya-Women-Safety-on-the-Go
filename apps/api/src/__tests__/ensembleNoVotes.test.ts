// P3 (lane F): when every provider fails the ensemble must not degrade to a
// rules-only floor silently. The api-visible signal is `rulesOnly: true` plus a
// per-provider outcome list in `fallbacks` (id:status), this is what
// /api/analyze already logs in the `model_call` event payload, so an operator can
// see "no model voted and why". This test pins that contract so a future refactor
// cannot drop the signal.
import { runEnsemble, type ScoreInput, type Scorer } from "@vaira/core";

const input: ScoreInput = { maskedFrameB64: "AAA", transcript30s: "", state: "AMBER" };

const budget = () => ({ canCall: () => true, record() {}, backoff() {} }) as any;
const reject = (id: any, status: unknown): Scorer => ({
  id,
  score: async () => {
    throw Object.assign(new Error(String(status)), { status });
  },
});

test("all providers reject → rulesOnly floor flagged, with each provider's outcome recorded", async () => {
  const r = await runEnsemble(input, {
    scorers: [
      reject("mistral-small-vision", 429),
      reject("groq-llama4-scout", 404),
      reject("gemini-flash-free", "malformed_json"),
    ],
    budget: budget(),
    claudeFallback: false,
    timeoutMs: 3000,
  });

  expect(r.rulesOnly).toBe(true); // api-visible "no votes" flag
  expect(r.votes).toHaveLength(0);
  // Per-provider outcomes are preserved so the no-votes cause is traceable.
  expect(r.fallbacks).toEqual(
    expect.arrayContaining([
      "mistral-small-vision:429",
      "groq-llama4-scout:404",
      "gemini-flash-free:malformed_json",
      "rules-only",
    ]),
  );
});
