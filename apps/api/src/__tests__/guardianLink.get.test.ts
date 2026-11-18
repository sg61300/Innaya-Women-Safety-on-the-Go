// Task 27: GET /api/guardian-link is owner-only and returns a signed live URL.
jest.mock("@/lib/auth", () => ({ requireUser: jest.fn().mockResolvedValue({ id: "owner1" }) }));
let journeyRow: unknown = { owner_id: "owner1" };
jest.mock("@/lib/supabaseAdmin", () => ({
  admin: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: journeyRow }) }) }) }),
  }),
}));

import { GET } from "@/app/api/guardian-link/route";

const get = (journeyId?: string) =>
  GET(
    new Request(`http://x/api/guardian-link${journeyId ? `?journeyId=${journeyId}` : ""}`, {
      headers: { authorization: "Bearer t" },
    }),
  );

beforeAll(() => {
  process.env.GUARDIAN_LINK_SECRET = "test-secret";
  process.env.APP_BASE_URL = "https://vaira.app";
});

test("200 with a signed url for the owner", async () => {
  journeyRow = { owner_id: "owner1" };
  const res = await get("j1");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.url).toMatch(/^https:\/\/vaira\.app\/g\/.+\..+$/);
});

test("403 for a non-owner", async () => {
  journeyRow = { owner_id: "someone-else" };
  const res = await get("j1");
  expect(res.status).toBe(403);
});

test("404 for an unknown journey", async () => {
  journeyRow = null;
  const res = await get("nope");
  expect(res.status).toBe(404);
});

test("400 when journeyId is missing", async () => {
  journeyRow = { owner_id: "owner1" };
  const res = await get();
  expect(res.status).toBe(400);
});

test("503 when the public app URL is not configured", async () => {
  journeyRow = { owner_id: "owner1" };
  const previous = process.env.APP_BASE_URL;
  delete process.env.APP_BASE_URL;
  try {
    const res = await get("j1");
    expect(res.status).toBe(503);
  } finally {
    process.env.APP_BASE_URL = previous;
  }
});

test("normalizes a trailing slash in the public app URL", async () => {
  journeyRow = { owner_id: "owner1" };
  process.env.APP_BASE_URL = "https://vaira.app/";
  const res = await get("j1");
  expect((await res.json()).url).toMatch(/^https:\/\/vaira\.app\/g\//);
});
