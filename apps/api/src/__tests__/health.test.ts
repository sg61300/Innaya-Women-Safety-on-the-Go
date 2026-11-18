// health is the one route under app/api/* with no test (QA session 20). It is a
// public probe: no auth and no request body, so the brief's "one auth failure +
// one bad input" cases are N/A here — the meaningful coverage is the providers
// env parsing that the mobile diagnostics screen (V12 / PrivacyTab) consumes.
import { GET } from "@/app/api/health/route";

const orig = process.env.SCORER_PROVIDERS;
afterEach(() => {
  if (orig === undefined) delete process.env.SCORER_PROVIDERS;
  else process.env.SCORER_PROVIDERS = orig;
});

test("happy path: ok true, providers parsed, ISO timestamp", async () => {
  process.env.SCORER_PROVIDERS = "groq,mistral,claude";
  const res = await GET();
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.providers).toEqual(["groq", "mistral", "claude"]);
  expect(typeof body.ts).toBe("string");
  expect(new Date(body.ts).toISOString()).toBe(body.ts); // valid ISO
});

test("unset providers → empty array, still ok", async () => {
  delete process.env.SCORER_PROVIDERS;
  const body = await (await GET()).json();
  expect(body.ok).toBe(true);
  expect(body.providers).toEqual([]);
});

test("whitespace and empty segments are trimmed/dropped", async () => {
  process.env.SCORER_PROVIDERS = " groq , , mistral ,";
  const body = await (await GET()).json();
  expect(body.providers).toEqual(["groq", "mistral"]);
});
