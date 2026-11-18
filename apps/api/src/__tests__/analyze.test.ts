// F2: /api/analyze bounds the request body before doing any work.
jest.mock("@/lib/auth", () => ({ requireUser: jest.fn().mockResolvedValue({ id: "u" }) }));
jest.mock("@/lib/providers", () => ({
  buildScorers: () => [],
  defaultBudget: () => ({}),
  claudeFallbackOn: () => false,
}));
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

test("rejects a maskedFrameB64 over 1,000,000 chars with 413", async () => {
  const res = await post({ journeyId: "j1", state: "SAFE", maskedFrameB64: "a".repeat(1_000_001), transcript30s: "" });
  expect(res.status).toBe(413);
});

test("rejects a transcript30s over 4,000 chars with 413", async () => {
  const res = await post({ journeyId: "j1", state: "SAFE", maskedFrameB64: "a", transcript30s: "a".repeat(4_001) });
  expect(res.status).toBe(413);
});

test("rejects a state outside SAFE|AMBER|EMERGENCY|CRITICAL with 400", async () => {
  const res = await post({ journeyId: "j1", state: "IDLE", maskedFrameB64: "a", transcript30s: "" });
  expect(res.status).toBe(400);
});
