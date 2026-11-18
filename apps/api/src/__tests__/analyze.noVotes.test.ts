// Q2a (lane F2): when every voter rejects, /api/analyze emits one greppable
// `scorer_no_votes` line with each provider's outcome, and the response is flagged
// rulesOnly. Uses rejecting scorers so runEnsemble (real) hits its no-votes floor.
jest.mock("@/lib/auth", () => ({ requireUser: jest.fn().mockResolvedValue({ id: "u" }) }));
jest.mock("@/lib/providers", () => {
  const reject = (id: string, status: unknown) => ({
    id,
    score: async () => {
      throw Object.assign(new Error(String(status)), { status });
    },
  });
  return {
    buildScorers: () => [reject("mistral-small-vision", 429), reject("groq-llama4-scout", 404)],
    defaultBudget: () => ({ canCall: () => true, record() {}, backoff() {} }),
    claudeFallbackOn: () => false,
  };
});
jest.mock("@/lib/supabaseAdmin", () => ({
  admin: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { owner_id: "u" } }) }) }) }),
  }),
}));
jest.mock("@/lib/events", () => ({ logEvent: jest.fn().mockResolvedValue(undefined) }));

import { POST } from "@/app/api/analyze/route";

const post = (body: unknown) =>
  POST(
    new Request("http://x/api/analyze", {
      method: "POST",
      headers: { authorization: "Bearer t", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

test("all providers reject → scorer_no_votes log line + rulesOnly flag", async () => {
  const err = jest.spyOn(console, "error").mockImplementation(() => {});
  const res = await post({ journeyId: "j1", state: "AMBER", maskedFrameB64: "a", transcript30s: "" });
  const out = await res.json();

  expect(out.rulesOnly).toBe(true); // no votes → rules-only floor
  // one structured line, journeyId + each provider's {id, outcome}
  const call = err.mock.calls.find((c) => c[0] === "scorer_no_votes");
  expect(call).toBeTruthy();
  const payload = JSON.parse(call![1] as string);
  expect(payload.journeyId).toBe("j1");
  expect(payload.providers).toEqual(
    expect.arrayContaining([
      { id: "mistral-small-vision", outcome: "429" },
      { id: "groq-llama4-scout", outcome: "404" },
    ]),
  );
  // the "rules-only" marker is not mistaken for a provider row
  expect(payload.providers.some((p: { id: string }) => p.id === "rules-only")).toBe(false);
  err.mockRestore();
});
