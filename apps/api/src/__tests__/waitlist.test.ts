// Products waitlist route: validation, rate limit, duplicate, happy path, plus
// the product_registered metrics record. The supabase admin() insert is mocked as
// a chainable builder so .insert().select().single() resolves; its result is
// configurable per test via mockInsert's resolved value.
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

// The confirmation email is mocked so the route's campaign branch never reaches
// the real Gmail sender (which would need SMTP creds). It is fire-and-forget in
// the route, so tests drain() before asserting it was (not) called.
const mockSendConfirm = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/waitlistEmail", () => ({ sendCampaignConfirmation: (to: string) => mockSendConfirm(to) }));

import { POST } from "@/app/api/waitlist/route";

// Each request uses a distinct IP so the in-memory 5/hour limiter (module-scoped
// Map, never reset between tests) does not bleed across cases.
let ipn = 0;
const post = (body: unknown, ip = `10.0.0.${++ipn}`) =>
  new Request("http://x/api/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

const valid = { name: "Asha Rao", email: "asha@example.com", product: "pendant", tier: "standard", consent: true };

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.MIXPANEL_TOKEN; // metrics record stays a pure no-op in tests
  mockInsert.mockResolvedValue({ data: { id: "hw-1" }, error: null });
});

// Drain the fire-and-forget product_registered IIFE so its insert cannot bleed
// into the next test's mock call list.
const drain = () => new Promise((r) => setImmediate(r));
afterEach(async () => { await drain(); });

describe("validation", () => {
  it("rejects short name with a field error", async () => {
    const r = await POST(post({ ...valid, name: "A" }));
    expect(r.status).toBe(400);
    const b = await r.json();
    expect(b.ok).toBe(false);
    expect(b.errors.name).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("requires email or phone", async () => {
    const { email, ...noContact } = valid;
    const r = await POST(post(noContact));
    expect(r.status).toBe(400);
    expect((await r.json()).errors.email).toBeDefined();
  });

  it("rejects unknown product and tier", async () => {
    const r = await POST(post({ ...valid, product: "watch", tier: "gold" }));
    expect(r.status).toBe(400);
    const b = await r.json();
    expect(b.errors.product).toBeDefined();
    expect(b.errors.tier).toBeDefined();
  });

  it("rejects consent !== true", async () => {
    const r = await POST(post({ ...valid, consent: false }));
    expect(r.status).toBe(400);
    expect((await r.json()).errors.consent).toBeDefined();
  });

  it("rejects a non-Indian phone", async () => {
    const { email, ...p } = valid;
    const r = await POST(post({ ...p, phone: "+1 415 555 0100" }));
    expect(r.status).toBe(400);
    expect((await r.json()).errors.phone).toBeDefined();
  });

  it("rejects a 10-digit number with a leading 0 (0XXXXXXXXXX)", async () => {
    const { email, ...p } = valid;
    const r = await POST(post({ ...p, phone: "09812345678" }));
    expect(r.status).toBe(400);
    expect((await r.json()).errors.phone).toBeDefined();
  });
});

describe("happy path", () => {
  it("inserts and returns ok:true, normalising email/phone", async () => {
    const { email, ...p } = valid;
    const r = await POST(post({ ...p, email: "ASHA@Example.com", phone: "9812345678", city: "Pune", source: "ig" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    const row = mockInsert.mock.calls[0][0];
    expect(row.email).toBe("asha@example.com");
    // bare 10-digit input normalised to +91XXXXXXXXXX
    expect(row.phone).toBe("+919812345678");
    expect(row.ip_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts a phone-only signup with +91 prefix", async () => {
    const { email, ...p } = valid;
    const r = await POST(post({ ...p, phone: "+919812345678" }));
    expect(r.status).toBe(200);
    expect(mockInsert.mock.calls[0][0].phone).toBe("+919812345678");
  });
});

describe("product_registered + waitlist_form_submitted metrics", () => {
  it("on a fresh insert writes both events, each carrying product slug + tier", async () => {
    const r = await POST(post({ ...valid, product: "brooch", tier: "luxury", source: "products:brooch", user_id: "11111111-1111-1111-1111-111111111111" }));
    expect(r.status).toBe(200);
    // first insert = hardware_interest, carrying user_id + source
    const hw = mockInsert.mock.calls[0][0];
    expect(hw.user_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(hw.source).toBe("products:brooch");
    await drain();
    // then the two site events, product_registered before waitlist_form_submitted
    const reg = mockInsert.mock.calls[1][0];
    expect(reg.type).toBe("product_registered");
    expect(reg.user_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(reg.payload).toMatchObject({ product: "brooch", tier: "luxury", source: "products:brooch" });
    const form = mockInsert.mock.calls[2][0];
    expect(form.type).toBe("waitlist_form_submitted");
    // R64: the form event must carry the product slug + tier so m9/m10 attribute.
    expect(form.payload).toMatchObject({ product: "brooch", tier: "luxury" });
  });

  it("carries the anonymous visitor_id when the submitter is not signed in", async () => {
    const r = await POST(post({ ...valid, visitor_id: "v-xyz" }));
    expect(r.status).toBe(200);
    await drain();
    const form = mockInsert.mock.calls.find((c) => c[0].type === "waitlist_form_submitted")?.[0];
    expect(form).toBeDefined();
    expect(form.user_id).toBeNull();
    expect(form.payload).toMatchObject({ product: "pendant", tier: "standard", visitor_id: "v-xyz" });
  });

  it("on a duplicate writes waitlist_form_submitted but NOT product_registered", async () => {
    mockInsert.mockResolvedValue({ data: null, error: { code: "23505" } });
    const r = await POST(post({ ...valid, product: "bangle", tier: "haute" }));
    expect(await r.json()).toEqual({ ok: true, duplicate: true });
    await drain();
    const types = mockInsert.mock.calls.map((c) => c[0].type);
    // hardware_interest attempt has no `type`; the only event is the form submit.
    expect(types).toContain("waitlist_form_submitted");
    expect(types).not.toContain("product_registered");
    const form = mockInsert.mock.calls.find((c) => c[0].type === "waitlist_form_submitted")?.[0];
    expect(form.payload).toMatchObject({ product: "bangle", tier: "haute" });
  });
});

describe("duplicate", () => {
  it("returns 200 {ok,duplicate} on unique violation (23505)", async () => {
    mockInsert.mockResolvedValue({ error: { code: "23505" } });
    const r = await POST(post(valid));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, duplicate: true });
  });
});

describe("rate limit", () => {
  it("blocks the 6th request from one IP within the hour", async () => {
    const ip = "203.0.113.9";
    for (let i = 0; i < 5; i++) {
      const r = await POST(post({ ...valid, email: `u${i}@example.com` }, ip));
      expect(r.status).toBe(200);
    }
    const sixth = await POST(post({ ...valid, email: "u6@example.com" }, ip));
    expect(sixth.status).toBe(429);
    expect((await sixth.json()).error).toBe("rate_limited");
  });
});

// Campaign landing page path (source:"campaign"): email-only, defaults, no
// product_registered, confirmation email on fresh insert (founder ruling
// 2026-09-24 campaign).
describe("campaign source", () => {
  const camp = (over: Record<string, unknown> = {}) => ({ email: "asha@example.com", consent: true, source: "campaign", ...over });

  it("accepts an email-only signup, defaults name/product/tier and returns ok:true", async () => {
    const r = await POST(post(camp({ city: "Delhi" })));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    const row = mockInsert.mock.calls[0][0];
    expect(row.email).toBe("asha@example.com");
    expect(row.name).toBe("asha"); // email local-part fallback
    expect(row.product).toBe("kit");
    expect(row.tier).toBe("standard");
    expect(row.city).toBe("Delhi");
  });

  it("requires email server-side (no phone substitute for campaign)", async () => {
    const r = await POST(post({ consent: true, source: "campaign", phone: "9812345678" }));
    expect(r.status).toBe(400);
    expect((await r.json()).errors.email).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("does NOT record product_registered, but DOES send the confirmation email", async () => {
    const r = await POST(post(camp({ visitor_id: "v-1" })));
    expect(r.status).toBe(200);
    await drain();
    const types = mockInsert.mock.calls.map((c) => c[0].type);
    expect(types).not.toContain("product_registered");
    expect(types).toContain("waitlist_form_submitted");
    const form = mockInsert.mock.calls.find((c) => c[0].type === "waitlist_form_submitted")?.[0];
    expect(form.payload).toMatchObject({ product: "kit", tier: "standard", source: "campaign" });
    expect(mockSendConfirm).toHaveBeenCalledWith("asha@example.com");
  });

  it("on a duplicate returns the friendly flag and sends NO confirmation email", async () => {
    mockInsert.mockResolvedValue({ data: null, error: { code: "23505" } });
    const r = await POST(post(camp()));
    expect(await r.json()).toEqual({ ok: true, duplicate: true });
    await drain();
    expect(mockSendConfirm).not.toHaveBeenCalled();
  });
});

// The confirmation email markup (real module, not the route mock above). Founder
// s28 item 9: the engraved emblem must ship in the email header.
describe("campaign confirmation email html", () => {
  // requireActual bypasses the jest.mock("@/lib/waitlistEmail") used by the route tests.
  const { campaignConfirmation } = jest.requireActual("@/lib/waitlistEmail") as typeof import("@/lib/waitlistEmail");
  const { html } = campaignConfirmation();

  it("carries the emblem logo with an absolute src and alt INNAYA", () => {
    expect(html).toContain('src="https://innaya.example.com/campaign/emblem-rosegold-alpha-256.png"');
    expect(html).toContain('alt="INNAYA"');
    expect(html).toContain('width="96"');
    expect(html).toContain('height="96"');
  });

  it("uses an ink header band and a table layout (Gmail/Outlook safe, no external CSS)", () => {
    expect(html).toContain("#0C0A1E");
    expect(html).toContain("<table");
    expect(html).not.toContain("<link"); // no external stylesheet
  });

  it("has no em/en dash in the public copy (founder rule)", () => {
    expect(html).not.toMatch(/&mdash;|&ndash;|&#8212;|&#8211;|[–—]/);
  });
});
