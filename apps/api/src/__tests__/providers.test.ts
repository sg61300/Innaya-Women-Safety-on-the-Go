import { mistralScorer } from "@/lib/providers/mistral";
import { groqScorer, resolveLlamaRoute } from "@/lib/providers/groq";
import { geminiScorer } from "@/lib/providers/gemini";
import { cloudflareScorer } from "@/lib/providers/cloudflare";
import { buildScorers } from "@/lib/providers";

const input = { maskedFrameB64: "AAA", transcript30s: "", state: "SAFE" as const };
const sig = () => new AbortController().signal;

const chatJson = (content: string) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  }) as unknown as Response;

// F3: spy on global.fetch so it is always restored by jest.restoreAllMocks(),
// never left mutated on the global for the next suite.
const mockFetch = (value: unknown) =>
  jest.spyOn(global, "fetch").mockResolvedValue(value as Response);

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.GROQ_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.SAMBANOVA_API_KEY;
});

test("mistral maps an OpenAI-style JSON response to a ScoreResult", async () => {
  const fetchMock = mockFetch(chatJson('{"danger":2,"reasons":["being_followed"]}'));
  const r = await mistralScorer("k").score(input, sig());
  expect(r.provider).toBe("mistral-small-vision");
  expect(r.danger).toBe(2);
  expect(r.reasons).toEqual(["being_followed"]);
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.mistral.ai/v1/chat/completions");
  expect(typeof r.latencyMs).toBe("number");
});

test("a non-2xx response throws an error carrying { status }", async () => {
  mockFetch({ ok: false, status: 429, text: async () => "rate limited" });
  await expect(mistralScorer("k").score(input, sig())).rejects.toMatchObject({ status: 429 });
});

test("out-of-range danger is clamped to the 0..3 rubric", async () => {
  mockFetch(chatJson('{"danger":7,"reasons":[]}'));
  const r = await mistralScorer("k").score(input, sig());
  expect(r.danger).toBe(3);
  expect(r.reasons).toEqual(["none"]);
});

test("Llama route falls back to OpenRouter when GROQ_API_KEY is empty", async () => {
  process.env.OPENROUTER_API_KEY = "or-key";
  const route = resolveLlamaRoute(process.env);
  expect(route?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
  const fetchMock = mockFetch(chatJson('{"danger":1,"reasons":["no_signal"]}'));
  const r = await groqScorer(route!).score(input, sig());
  expect(r.provider).toBe("groq-llama4-scout"); // id unchanged even via OpenRouter
  expect(r.danger).toBe(1);
  expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
});

test("Groq route prefers Groq, then OpenRouter, then SambaNova, else null", () => {
  expect(resolveLlamaRoute({} as any)).toBeNull();
  expect(resolveLlamaRoute({ SAMBANOVA_API_KEY: "s" } as any)?.url).toBe("https://api.sambanova.ai/v1/chat/completions");
  expect(resolveLlamaRoute({ GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" } as any)?.url).toBe("https://api.groq.com/openai/v1/chat/completions");
});

test("gemini maps a generateContent response", async () => {
  const fetchMock = mockFetch({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: '{"danger":0,"reasons":["none"]}' }] } }] }),
  });
  const r = await geminiScorer("k").score(input, sig());
  expect(r.provider).toBe("gemini-flash-free");
  expect(r.danger).toBe(0);
  expect(String(fetchMock.mock.calls[0][0])).toContain(":generateContent");
});

// P7.1 (lane F): gemini-3.6-flash's free-tier day quota was exhausted by the B7 +
// run-2 probes. Quota is per model, so the default moved to gemini-3.8-flash (the
// newest flash listed for this key, live-probed 2026-09-06: 200 OK + valid JSON +
// vision input with the thinkingBudget:0 fix). GEMINI_MODEL still overrides.
test("gemini defaults to gemini-3.5-flash (Q1: only working candidate)", async () => {
  const fetchMock = mockFetch({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: '{"danger":0,"reasons":["none"]}' }] } }] }),
  });
  await geminiScorer("k").score(input, sig());
  expect(String(fetchMock.mock.calls[0][0])).toContain("gemini-3.5-flash:generateContent");
});

// P1 (lane F): gemini-3.6-flash is a thinking model; without thinkingBudget:0 the
// token budget is spent on hidden thinking and the answer returns empty with
// finishReason MAX_TOKENS. The request must disable thinking, and an empty answer
// must be surfaced as a failed voter (status malformed_json), never a silent 0.
test("gemini request disables thinking (thinkingBudget 0) and keeps JSON mime", async () => {
  const fetchMock = mockFetch({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"danger":1,"reasons":["no_signal"]}' }] } }] }),
  });
  await geminiScorer("k").score(input, sig());
  const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
  expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  expect(body.generationConfig.responseMimeType).toBe("application/json");
});

test("gemini MAX_TOKENS (empty output) throws status 'malformed_json', not a silent score", async () => {
  mockFetch({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] }),
  });
  await expect(geminiScorer("k").score(input, sig())).rejects.toMatchObject({ status: "malformed_json" });
  await expect(geminiScorer("k").score(input, sig())).rejects.toThrow(/MAX_TOKENS/);
});

// P2 (lane F): with GROQ_API_KEY present the route is the direct Groq audio-channel
// voter (no vision model on the account), qwen3.8-27b, no image sent.
test("Groq route is a text-only qwen voter that omits the image", async () => {
  process.env.GROQ_API_KEY = "g";
  const route = resolveLlamaRoute(process.env)!;
  expect(route.url).toBe("https://api.groq.com/openai/v1/chat/completions");
  expect(route.model).toBe("qwen/qwen3.8-27b");
  expect(route.omitImage).toBe(true);
  const fetchMock = mockFetch(chatJson('{"danger":3,"reasons":["threatening_speech"]}'));
  const r = await groqScorer(route).score(input, sig());
  expect(r.danger).toBe(3);
  const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
  // user content is a plain string (no image_url part) and carries the no-frame note.
  expect(typeof body.messages[1].content).toBe("string");
  expect(body.messages[1].content).toContain("no camera frame is available");
});

// D1 (R45, lane F3): a transcript-only scream must yield an audio vote when Groq
// returns valid JSON — proof the Groq PATH is sound. The live R45 miss (no Groq
// vote on any of 11 scenarios) was an upstream 429 on the first call that tripped
// the ensemble's 60 s backoff (rest skipped as :budget), not a code defect.
test("Groq audio voter yields a danger vote for a transcript-only scream", async () => {
  process.env.GROQ_API_KEY = "g";
  const route = resolveLlamaRoute(process.env)!;
  const scream = {
    maskedFrameB64: "",
    transcript30s: "AAAH! Help! Get away from me! Somebody help me please!",
    state: "AMBER" as const,
  };
  const fetchMock = mockFetch(chatJson('{"danger":3,"reasons":["user_distress_voice","threatening_speech"]}'));
  const r = await groqScorer(route).score(scream, sig());
  expect(r.provider).toBe("groq-llama4-scout");
  expect(r.danger).toBe(3);
  expect(r.reasons).toEqual(["user_distress_voice", "threatening_speech"]);
  // audio-channel: the transcript is sent as plain text, no image part.
  const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
  expect(typeof body.messages[1].content).toBe("string");
  expect(body.messages[1].content).toContain("Help!");
});

// When GROQ_API_KEY is empty the route is the OpenRouter free VISION slug, which
// retired the llama-4-scout:free slug (404). It now defaults to a live free vision
// slug and falls back to the next slugs ONLY on 404/410.
test("OpenRouter route defaults to a live free vision slug with a fallback chain", () => {
  const route = resolveLlamaRoute({ OPENROUTER_API_KEY: "or" } as any);
  expect(route?.model).toBe("minimax/minimax-m3:free");
  expect(route?.fallbackModels).toEqual(["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free"]);
  expect(route?.omitImage).toBeUndefined(); // vision route keeps the image
});

test("OpenRouter voter retries the next slug on 404 (retired), then succeeds", async () => {
  process.env.OPENROUTER_API_KEY = "or";
  const route = resolveLlamaRoute(process.env)!;
  const fetchMock = jest.spyOn(global, "fetch").mockImplementation(async () => {
    return fetchMock.mock.calls.length === 1
      ? ({ ok: false, status: 404, text: async () => "No endpoints found for model" } as unknown as Response)
      : chatJson('{"danger":2,"reasons":["being_followed"]}');
  });
  const r = await groqScorer(route).score(input, sig());
  expect(r.danger).toBe(2);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const m1 = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).model;
  const m2 = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string).model;
  expect(m1).toBe("minimax/minimax-m3:free");
  expect(m2).toBe("google/gemma-4-31b-it:free");
});

test("OpenRouter voter does NOT burn the fallback chain on 429 (surfaces it)", async () => {
  process.env.OPENROUTER_API_KEY = "or";
  const route = resolveLlamaRoute(process.env)!;
  const fetchMock = mockFetch({ ok: false, status: 429, text: async () => "rate limited" });
  await expect(groqScorer(route).score(input, sig())).rejects.toMatchObject({ status: 429 });
  expect(fetchMock).toHaveBeenCalledTimes(1); // no fallback attempt on 429
});

// P7.2 (lane F) + Q3 (lane F2): Cloudflare Workers AI vision adapter, live-probed
// 2026-09-06 (200 OK, valid JSON, ~7.95 neurons/call). Now wired into
// buildScorers/runEnsemble (ProviderId added to core, AMBER_SET + SAFE borrow).
test("cloudflare maps a Workers AI run response to a danger score", async () => {
  const fetchMock = mockFetch({
    ok: true,
    status: 200,
    json: async () => ({ success: true, result: { response: { danger: 1, reasons: ["no_signal"] } } }),
  });
  const r = await cloudflareScorer("acct", "tok").score(input, sig());
  expect(r.danger).toBe(1);
  expect(r.reasons).toEqual(["no_signal"]);
  const [url, init] = fetchMock.mock.calls[0];
  expect(String(url)).toBe("https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/meta/llama-3.2-11b-vision-instruct");
  expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer tok" });
});

test("cloudflare surfaces a Workers AI application-level error (success:false)", async () => {
  mockFetch({
    ok: true,
    status: 200,
    json: async () => ({ success: false, errors: [{ code: 5016, message: "Model Agreement" }] }),
  });
  await expect(cloudflareScorer("acct", "tok").score(input, sig())).rejects.toMatchObject({ status: 5016 });
});

// Q3 (lane F2): buildScorers registers the Cloudflare voter iff BOTH the token and
// the account id are set, and omits it when either is missing.
test("buildScorers registers the cloudflare voter only when both CF keys are set", () => {
  const withKeys = buildScorers({ CLOUDFLARE_API_TOKEN: "tok", CLOUDFLARE_ACCOUNT_ID: "acct" } as any);
  expect(withKeys.map((s) => s.id)).toContain("cloudflare-llama-vision");

  const tokenOnly = buildScorers({ CLOUDFLARE_API_TOKEN: "tok" } as any);
  expect(tokenOnly.map((s) => s.id)).not.toContain("cloudflare-llama-vision");

  const none = buildScorers({} as any);
  expect(none.map((s) => s.id)).not.toContain("cloudflare-llama-vision");
});
