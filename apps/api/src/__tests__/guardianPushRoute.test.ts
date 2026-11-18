// W-T1: saving a guardian's browser subscription. Valid signed token stores against
// the token's contact; bad, expired or contact-less tokens are refused; a repeat save
// does not duplicate (the table's unique key is modelled by the Map below).
const rows = new Map<string, any>();
const upsert = jest.fn(async (row: any, opts: any) => {
  expect(opts).toEqual({ onConflict: "contact_id,endpoint" });
  rows.set(`${row.contact_id}|${row.endpoint}`, row);
  return { error: null };
});
jest.mock("@/lib/supabaseAdmin", () => ({ admin: () => ({ from: () => ({ upsert }) }) }));

import { POST } from "@/app/api/guardian-push/route";
import { signGuardianToken } from "@/lib/token";

const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  keys: { p256dh: "key-p256dh", auth: "key-auth" },
};
const post = (body: unknown) =>
  POST(new Request("https://x.test/api/guardian-push", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeAll(() => { process.env.GUARDIAN_LINK_SECRET = "test-secret"; });
beforeEach(() => { rows.clear(); upsert.mockClear(); });

test("valid token stores against the contact inside the token", async () => {
  const res = await post({ token: signGuardianToken("j1", "contact-1"), subscription });
  expect(res.status).toBe(204);
  expect([...rows.values()]).toEqual([
    { contact_id: "contact-1", endpoint: subscription.endpoint, p256dh: "key-p256dh", auth: "key-auth" },
  ]);
});

test("a contact id in the body is ignored: only the signed token decides", async () => {
  await post({ token: signGuardianToken("j1", "contact-1"), contactId: "someone-else", contact_id: "someone-else", subscription });
  expect([...rows.values()][0].contact_id).toBe("contact-1");
});

test("repeat save does not duplicate", async () => {
  const token = signGuardianToken("j1", "contact-1");
  await post({ token, subscription });
  await post({ token, subscription });
  expect(rows.size).toBe(1);
});

test.each([
  ["tampered", () => signGuardianToken("j1", "contact-1") + "x", 401],
  ["expired", () => signGuardianToken("j1", "contact-1", -1000), 401],
  ["journey-only (no contact)", () => signGuardianToken("j1"), 403],
])("%s token is refused and nothing is stored", async (_name, token, status) => {
  const res = await post({ token: (token as () => string)(), subscription });
  expect(res.status).toBe(status);
  expect(upsert).not.toHaveBeenCalled();
});

test.each([
  ["not JSON", "{oops"],
  ["no subscription", { token: "t" }],
  ["missing keys", { token: "t", subscription: { endpoint: subscription.endpoint } }],
  ["plain http endpoint", { token: "t", subscription: { ...subscription, endpoint: "http://fcm.googleapis.com/x" } }],
  ["endpoint on a host that is not a push service", { token: "t", subscription: { ...subscription, endpoint: "https://169.254.169.254/latest" } }],
  ["look-alike host", { token: "t", subscription: { ...subscription, endpoint: "https://fcm.googleapis.com.evil.test/x" } }],
  ["oversized endpoint", { token: "t", subscription: { ...subscription, endpoint: "https://fcm.googleapis.com/" + "a".repeat(3000) } }],
])("%s is refused with 400", async (_name, body) => {
  const res = await post(body);
  expect(res.status).toBe(400);
  expect(upsert).not.toHaveBeenCalled();
});

test("a database error returns 500, it does not claim success", async () => {
  upsert.mockResolvedValueOnce({ error: { message: "down" } } as any);
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  const res = await post({ token: signGuardianToken("j1", "contact-1"), subscription });
  expect(res.status).toBe(500);
  spy.mockRestore();
});
