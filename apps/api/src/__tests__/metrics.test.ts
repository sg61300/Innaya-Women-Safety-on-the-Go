// /api/metrics: allowlisted site events -> events row + Mixpanel (fire-and-forget).
const mockInsert = jest.fn();
jest.mock("@/lib/supabaseAdmin", () => ({
  admin: () => ({
    from: () => ({
      insert: (v: any) => {
        const result = Promise.resolve(mockInsert(v));
        const builder: any = {
          select: () => builder,
          single: () => result,
          then: (res: any, rej: any) => result.then(res, rej),
        };
        return builder;
      },
    }),
  }),
}));

import { POST } from "@/app/api/metrics/route";

const post = (body: unknown) =>
  new Request("http://x/api/metrics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const drain = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.MIXPANEL_TOKEN;
  mockInsert.mockResolvedValue({ data: { id: 7 }, error: null });
});

it("records products_opened with the visitor id in the payload", async () => {
  const r = await POST(post({ type: "products_opened", visitor_id: "v-abc" }));
  expect(r.status).toBe(200);
  const row = mockInsert.mock.calls[0][0];
  expect(row.type).toBe("products_opened");
  expect(row.user_id).toBeNull();
  expect(row.payload).toMatchObject({ visitor_id: "v-abc" });
  await drain();
});

it("rejects a type that is not on the allowlist", async () => {
  const r = await POST(post({ type: "hacked_event" }));
  expect(r.status).toBe(400);
  expect(mockInsert).not.toHaveBeenCalled();
});

it("rejects invalid json", async () => {
  const r = await POST(new Request("http://x/api/metrics", { method: "POST", body: "{oops" }));
  expect(r.status).toBe(400);
});
