// Mixpanel server-side lib: no-op without a token, correct payload with one.
const realFetch = global.fetch;
const mockFetch = jest.fn();

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  delete process.env.MIXPANEL_TOKEN;
  delete process.env.MIXPANEL_REGION;
  (global as any).fetch = mockFetch;
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ status: 1 }) });
});

afterAll(() => {
  (global as any).fetch = realFetch;
});

it("no-ops (no fetch) when MIXPANEL_TOKEN is unset", async () => {
  const { trackOne } = await import("@/lib/mixpanel");
  const sent = await trackOne({ event: "signup_completed", distinctId: "u1" });
  expect(sent).toBe(false);
  expect(mockFetch).not.toHaveBeenCalled();
});

it("posts the right payload (token, distinct_id, $insert_id, props) with a token", async () => {
  process.env.MIXPANEL_TOKEN = "tok_123";
  const { trackOne } = await import("@/lib/mixpanel");
  const sent = await trackOne({
    event: "product_registered",
    distinctId: "u9",
    insertId: "evt-42",
    props: { product: "pendant", tier: "luxury" },
  });
  expect(sent).toBe(true);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  const [url, opts] = mockFetch.mock.calls[0];
  expect(url).toBe("https://api.mixpanel.com/track?verbose=1");
  const body = JSON.parse((opts as RequestInit).body as string);
  expect(body).toHaveLength(1);
  expect(body[0].event).toBe("product_registered");
  expect(body[0].properties).toMatchObject({
    token: "tok_123",
    distinct_id: "u9",
    $insert_id: "evt-42",
    product: "pendant",
    tier: "luxury",
  });
});

it("routes to the EU host when MIXPANEL_REGION=eu", async () => {
  process.env.MIXPANEL_TOKEN = "tok_eu";
  process.env.MIXPANEL_REGION = "eu";
  const { track } = await import("@/lib/mixpanel");
  await track([{ event: "regions_opened", distinctId: "u2" }]);
  expect(mockFetch.mock.calls[0][0]).toBe("https://api-eu.mixpanel.com/track?verbose=1");
});

it("swallows a fetch rejection and returns false (never throws)", async () => {
  process.env.MIXPANEL_TOKEN = "tok_x";
  mockFetch.mockRejectedValueOnce(new Error("network down"));
  const { trackOne } = await import("@/lib/mixpanel");
  await expect(trackOne({ event: "golive_started", distinctId: "u3" })).resolves.toBe(false);
});
