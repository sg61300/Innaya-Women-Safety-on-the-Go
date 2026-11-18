// Lane E3 / X5a — POST /api/simulate-proof: emails the caller's OWN account email a
// practice proof, never a guardian. Auth, bad body, rate limit, and "sends to the
// caller only" are guarded here.
process.env.GMAIL_SMTP_PASS = "test-pass";

jest.mock("@/lib/auth", () => ({ requireUser: jest.fn() }));
jest.mock("@/lib/alerts", () => ({
  ...jest.requireActual("@/lib/alerts"),
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendPush: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/events", () => ({ logEvent: jest.fn().mockResolvedValue(undefined) }));

// In-memory admin(). `counts[table]` feeds .select(_, {count, head}); uploads and
// row inserts are recorded so tests can assert exactly what the route wrote.
const counts: Record<string, number> = {};
const inserted: any[] = [];
const uploads: { bucket: string; path: string; contentType?: string }[] = [];
let uploadError: string | null = null;

jest.mock("@/lib/supabaseAdmin", () => ({
  admin: () => ({
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _buf: unknown, opts: any) => {
          uploads.push({ bucket, path, contentType: opts?.contentType });
          return { error: uploadError ? { message: uploadError } : null };
        },
        createSignedUrl: async () => ({ data: { signedUrl: "https://signed.example/proof" } }),
      }),
    },
    from: (t: string) => {
      const b: any = {
        select: (_c?: unknown, o?: { count?: string; head?: boolean }) =>
          o?.head ? b : b,
        eq: () => b,
        gte: () => b,
        // awaited select(...).eq().gte() resolves to the count result
        then: (res: any) => res({ count: counts[t] ?? 0, data: null, error: null }),
        insert: (v: any) => { inserted.push({ table: t, ...v }); return { then: (res: any) => res({ data: null, error: null }) }; },
      };
      return b;
    },
  }),
}));

import { POST } from "@/app/api/simulate-proof/route";
import { requireUser } from "@/lib/auth";
import { sendEmail, sendPush } from "@/lib/alerts";

const ACCOUNT = "tester@example.com";
const asUser = (id: string, email?: string) => (requireUser as jest.Mock).mockResolvedValue({ id, email });
const asUnauth = () => (requireUser as jest.Mock).mockRejectedValue(new Response("unauthorized", { status: 401 }));
const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString("base64");
const postJson = (body: unknown) =>
  new Request("http://x/api/simulate-proof", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(counts)) delete counts[k];
  inserted.length = 0;
  uploads.length = 0;
  uploadError = null;
});

test("401 when unauthenticated", async () => {
  asUnauth();
  const res = await POST(postJson({ kind: "photo", media: tinyJpeg }));
  expect(res.status).toBe(401);
  expect(sendEmail).not.toHaveBeenCalled();
});

test("400 no account email", async () => {
  asUser("u1", undefined);
  const res = await POST(postJson({ kind: "photo", media: tinyJpeg }));
  expect(res.status).toBe(400);
  expect(sendEmail).not.toHaveBeenCalled();
});

test("400 bad body (bad kind / empty media / missing media)", async () => {
  asUser("u1", ACCOUNT);
  expect((await POST(postJson({ kind: "audio", media: tinyJpeg }))).status).toBe(400);
  expect((await POST(postJson({ kind: "photo", media: "" }))).status).toBe(400);
  expect((await POST(postJson({ kind: "photo" }))).status).toBe(400);
  expect(sendEmail).not.toHaveBeenCalled();
});

test("400 oversize media", async () => {
  asUser("u1", ACCOUNT);
  const big = "A".repeat(28 * 1024 * 1024); // >20 MB decoded
  const res = await POST(postJson({ kind: "photo", media: big }));
  expect(res.status).toBe(400);
  expect(sendEmail).not.toHaveBeenCalled();
});

test("200 sends ONE email to the CALLER's own account email — no guardian, no push", async () => {
  asUser("u1", ACCOUNT);
  const res = await POST(postJson({ kind: "photo", media: tinyJpeg }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, sentTo: ACCOUNT });
  // exactly one email, to the account email only
  expect(sendEmail).toHaveBeenCalledTimes(1);
  const [to, subject] = (sendEmail as jest.Mock).mock.calls[0];
  expect(to).toEqual([ACCOUNT]);
  expect(subject).toBe("INNAYA simulation: your proof");
  // never a push (no guardian channel)
  expect(sendPush).not.toHaveBeenCalled();
  // stored under simulation/<userId>/ in the selfies bucket, never cancel/
  expect(uploads).toHaveLength(1);
  expect(uploads[0].bucket).toBe("selfies");
  expect(uploads[0].path.startsWith("simulation/u1/")).toBe(true);
  expect(uploads[0].path.includes("cancel/")).toBe(false);
  // ledger row written to simulation_proofs only (never cancel_requests/alerts/votes)
  expect(inserted).toHaveLength(1);
  expect(inserted[0].table).toBe("simulation_proofs");
  expect(inserted.some((r) => ["cancel_requests", "cancel_votes", "alerts"].includes(r.table))).toBe(false);
});

test("429 when the hourly rate limit is reached", async () => {
  asUser("u1", ACCOUNT);
  counts["simulation_proofs"] = 5;
  const res = await POST(postJson({ kind: "video", media: tinyJpeg }));
  expect(res.status).toBe(429);
  expect(sendEmail).not.toHaveBeenCalled();
  expect(uploads).toHaveLength(0);
});

test("502 when the storage upload fails — no email, no ledger row", async () => {
  asUser("u1", ACCOUNT);
  uploadError = "bucket down";
  const res = await POST(postJson({ kind: "photo", media: tinyJpeg }));
  expect(res.status).toBe(502);
  expect(sendEmail).not.toHaveBeenCalled();
  expect(inserted).toHaveLength(0);
});
