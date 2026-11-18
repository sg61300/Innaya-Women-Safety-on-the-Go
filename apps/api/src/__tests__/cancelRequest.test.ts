// ADR-043 /api/cancel-request (owner opens) + /api/cancel-request/[id]/vote (guardian votes).
process.env.GUARDIAN_LINK_SECRET = "test-secret";
process.env.APP_BASE_URL = "http://app";

jest.mock("@/lib/auth", () => ({ requireUser: jest.fn() }));
jest.mock("@/lib/alerts", () => ({ ...jest.requireActual("@/lib/alerts"), sendPush: jest.fn().mockResolvedValue(undefined), sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/events", () => ({ logEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/journeyState", () => ({ applyEvent: jest.fn() }));

// In-memory admin() db. `single[table]` feeds .single()/.maybeSingle(); `list[table]`
// feeds an awaited chain (…eq/…in/…order/…upsert); `insertReturn[table]` feeds
// insert().select().single(). Writes are recorded.
const single: Record<string, any> = {};
const list: Record<string, any[]> = {};
const insertReturn: Record<string, any> = {};
const inserted: any[] = [];
const updated: any[] = [];
const upserted: any[] = [];

jest.mock("@/lib/supabaseAdmin", () => ({
  admin: () => ({
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "http://signed" } }) }) },
    from: (t: string) => {
      const result = { data: list[t] ?? null, error: null };
      const b: any = {
        select: () => b, eq: () => b, in: () => b, is: () => b, order: () => b, limit: () => b,
        single: async () => ({ data: single[t] ?? null }),
        maybeSingle: async () => ({ data: single[t] ?? null }),
        then: (res: any) => res(result),
        insert: (v: any) => { inserted.push({ table: t, ...v }); return { select: () => ({ single: async () => ({ data: insertReturn[t] ?? null }) }), then: (res: any) => res({ data: null, error: null }) }; },
        upsert: (v: any, o: any) => { upserted.push({ table: t, v, o }); return { then: (res: any) => res({ data: null, error: null }) }; },
        update: (v: any) => ({ eq: () => { updated.push({ table: t, ...v }); const p: any = Promise.resolve({ data: [{ id: "claimed" }], error: null }); p.is = () => p; p.eq = () => p; p.gte = () => p; p.select = () => p; return p; } }),
      };
      return b;
    },
  }),
}));

import { POST as OPEN } from "@/app/api/cancel-request/route";
import { POST as VOTE } from "@/app/api/cancel-request/[id]/vote/route";
import { requireUser } from "@/lib/auth";
import { sendPush, sendEmail } from "@/lib/alerts";
import { applyEvent } from "@/lib/journeyState";
import { signCancelVoteToken } from "@/lib/token";

const asUser = (id: string) => (requireUser as jest.Mock).mockResolvedValue({ id });
const postJson = (body: unknown) => new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const votePost = (id: string, t: string, safe: boolean) =>
  new Request(`http://x/api/cancel-request/${id}/vote?t=${encodeURIComponent(t)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ safe }) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.clearAllMocks();
  for (const o of [single, list, insertReturn]) for (const k of Object.keys(o)) delete (o as any)[k];
  inserted.length = 0; updated.length = 0; upserted.length = 0;
  // Fix lane F1: the vote cancel path moves the state through the 0036 atomic step (applyEvent
  // with opts.atomicClaim). Jest has no Postgres, so the mocked applyEvent stands in for the SQL
  // function: it records the row-close and reports it claimed. This checks a JS stand-in, not the
  // real SQL step (that is proven by supabase/tests/0036_*.test.sql, run on a real DB).
  (applyEvent as jest.Mock).mockImplementation(async (_j: string, _ev: unknown, _actor: string, _deps: unknown, opts?: { atomicClaim?: unknown }) => {
    if (opts?.atomicClaim) {
      updated.push({ table: "cancel_requests", verdict: "cancel", resolved_at: new Date().toISOString() });
      return { state: "RESOLVED_MONITORING", actions: [], claimed: true, outcome: "applied" };
    }
    return { state: "CANCEL_HOLD", actions: [] };
  });
});

// ---- open ----
test("open: owner → picks <=3 reachable guardians, emergency tier first, writes row, asks them, applies CANCEL_REQUESTED", async () => {
  asUser("owner1");
  single.journeys = { owner_id: "owner1", from_label: "A", to_label: "B", alarm_mode: "siren", status: "monitoring" };
  single.journey_state = { state: "CRITICAL" };
  list.contacts = [
    { id: "buf", email: "buf@x", linked_user_id: null, tier: "buffer", position: 0 },
    { id: "p2", email: null, linked_user_id: "u2", tier: "primary", position: 2 },
    { id: "p1", email: "p1@x", linked_user_id: null, tier: "primary", position: 1 },
    { id: "unreach", email: null, linked_user_id: null, tier: "primary", position: 3 },
  ];
  list.profiles = [{ id: "u2", expo_push_token: "ExpoTok" }];
  insertReturn.cancel_requests = { id: "req1" };
  const res = await OPEN(postJson({ journeyId: "j1", method: "word" }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.requestId).toBe("req1");
  // p1, p2 (primary, by position) then buf; the unreachable contact is dropped.
  expect(body.asked).toEqual(["p1", "p2", "buf"]);
  expect(inserted.some((i) => i.table === "cancel_requests" && JSON.stringify(i.asked_contact_ids) === JSON.stringify(["p1", "p2", "buf"]))).toBe(true);
  expect(applyEvent).toHaveBeenCalledWith("j1", { type: "CANCEL_REQUESTED", method: "word" }, "user");
  // linked guardian gets a NORMAL-channel push (no channelId/sound → never vaira-alarm-2)
  expect(sendPush).toHaveBeenCalledWith(["ExpoTok"], expect.any(String), expect.any(String), expect.objectContaining({ kind: "cancel_request" }));
  expect((sendPush as jest.Mock).mock.calls[0][4]).toBeUndefined();
  expect(sendEmail).toHaveBeenCalled();
});

test("open: a SAFE journey is refused (409, no alarm running)", async () => {
  asUser("owner1");
  single.journeys = { owner_id: "owner1", alarm_mode: "siren", status: "monitoring" };
  single.journey_state = { state: "SAFE" };
  const res = await OPEN(postJson({ journeyId: "j1", method: "word" }));
  expect(res.status).toBe(409);
  expect(inserted).toHaveLength(0);
});

test("G8: an expired journey still takes the request (an offline retry after the 15-min expiry); a finished one does not", async () => {
  asUser("owner1");
  single.journeys = { owner_id: "owner1", from_label: "A", to_label: "B", alarm_mode: "siren", status: "expired" };
  single.journey_state = { state: "CRITICAL" };
  list.contacts = [{ id: "p1", email: "p1@x", linked_user_id: null, tier: "primary", position: 1 }];
  insertReturn.cancel_requests = { id: "req1" };
  expect((await OPEN(postJson({ journeyId: "j1", method: "word" }))).status).toBe(200);
  single.journeys = { ...single.journeys, status: "done" };
  expect((await OPEN(postJson({ journeyId: "j1", method: "word" }))).status).toBe(409);
});

test("open: a second call while a request is open returns the same id and does not re-notify", async () => {
  asUser("owner1");
  single.journeys = { owner_id: "owner1", from_label: "A", to_label: "B", alarm_mode: "siren", status: "monitoring" };
  single.journey_state = { state: "CANCEL_HOLD" };
  single.cancel_requests = { id: "reqOpen", asked_contact_ids: ["p1", "p2"] };
  const res = await OPEN(postJson({ journeyId: "j1", method: "word" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ requestId: "reqOpen", asked: ["p1", "p2"] });
  expect(inserted).toHaveLength(0);
  expect(sendPush).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
  expect(applyEvent).not.toHaveBeenCalled();
});

test("open: a non-owner is forbidden (403)", async () => {
  asUser("intruder");
  single.journeys = { owner_id: "owner1", alarm_mode: "siren" };
  const res = await OPEN(postJson({ journeyId: "j1", method: "word" }));
  expect(res.status).toBe(403);
});

test("open: photo/video media path from another journey is rejected (400)", async () => {
  asUser("owner1");
  single.journeys = { owner_id: "owner1", alarm_mode: "siren" };
  const res = await OPEN(postJson({ journeyId: "j1", method: "photo", mediaPath: "cancel/OTHER/req1.jpg" }));
  expect(res.status).toBe(400);
  expect(inserted).toHaveLength(0);
});

// Fix AB / B T1 (founder Q79): the proof lives in her OWN folder
// <uid>/cancel/<journeyId>/ (the selfies insert policy needs folder 1 = auth.uid()).
test("open: photo proof under <her uid>/cancel/<journeyId>/ is accepted and stored as sent", async () => {
  asUser("owner1");
  single.journeys = { owner_id: "owner1", from_label: "A", to_label: "B", alarm_mode: "siren", status: "active" };
  single.journey_state = { state: "CRITICAL" };
  list.contacts = [];
  insertReturn.cancel_requests = { id: "req1" };
  const res = await OPEN(postJson({ journeyId: "j1", method: "photo", mediaPath: "owner1/cancel/j1/p1.jpg" }));
  expect(res.status).toBe(200);
  expect(inserted.find((r) => r.table === "cancel_requests")?.media_path).toBe("owner1/cancel/j1/p1.jpg");
});

test.each([
  ["another user's folder", "intruder/cancel/j1/p1.jpg"],
  ["another journey in her folder", "owner1/cancel/OTHER/p1.jpg"],
  ["the old shared prefix", "cancel/j1/p1.jpg"],
])("open: photo/video proof in %s is rejected (400)", async (_label, mediaPath) => {
  asUser("owner1");
  single.journeys = { owner_id: "owner1", alarm_mode: "siren", status: "active" };
  single.journey_state = { state: "CRITICAL" };
  const res = await OPEN(postJson({ journeyId: "j1", method: "video", mediaPath }));
  expect(res.status).toBe(400);
  expect(inserted).toHaveLength(0);
});

test("open: an unknown method is rejected (400)", async () => {
  asUser("owner1");
  const res = await OPEN(postJson({ journeyId: "j1", method: "fingerprint" }));
  expect(res.status).toBe(400);
});

test("open: user-typed place labels are HTML-escaped in the guardian email (no injection)", async () => {
  asUser("owner1");
  single.journeys = { owner_id: "owner1", from_label: "<img src=x onerror=1>", to_label: "Home", alarm_mode: "siren", status: "monitoring" };
  single.journey_state = { state: "CRITICAL" };
  list.contacts = [{ id: "p1", email: "p1@x", linked_user_id: null, tier: "primary", position: 1 }];
  insertReturn.cancel_requests = { id: "req1" };
  const res = await OPEN(postJson({ journeyId: "j1", method: "word" }));
  expect(res.status).toBe(200);
  const html = (sendEmail as jest.Mock).mock.calls[0][2] as string;
  expect(html).toContain("&lt;img src=x onerror=1&gt;");
  expect(html).not.toContain("<img");
});

// ---- vote ----
const reqRow = (extra: any = {}) => ({ created_at: new Date().toISOString(), id: "req1", journey_id: "j1", owner_id: "owner1", asked_contact_ids: ["c1", "c2", "c3"], method: "word", ...extra });

test("vote: first Safe → verdict cancel, applies GUARDIAN_VOTE{safe:true}, resolves, audits", async () => {
  single.cancel_requests = reqRow();
  single.journeys = { alarm_mode: "siren" };
  single.contacts = { name: "Mum", email: "m@x" };
  list.cancel_votes = [{ safe: true, created_at: 1 }];
  const t = signCancelVoteToken("req1", "c1");
  const res = await VOTE(votePost("req1", t, true), ctx("req1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ verdict: "cancel", state: "RESOLVED_MONITORING" });
  expect(applyEvent).toHaveBeenCalledWith("j1", { type: "GUARDIAN_VOTE", safe: true, contactId: "c1" }, "trustee", undefined, { atomicClaim: { requestId: "req1", claimMode: "open", closeSiblings: true } });
  expect(updated.some((u) => u.table === "cancel_requests" && u.verdict === "cancel" && u.resolved_at)).toBe(true);
  expect(inserted.some((i) => i.table === "alerts" && i.recipient === "c1")).toBe(true);
});

test("vote: 2 of 3 Not safe → verdict keep, applies GUARDIAN_SAYS_WRONG", async () => {
  single.cancel_requests = reqRow();
  single.journeys = { alarm_mode: "siren" };
  list.cancel_votes = [{ safe: false, created_at: 1 }, { safe: false, created_at: 2 }];
  (applyEvent as jest.Mock).mockResolvedValue({ state: "CRITICAL", actions: [] });
  const res = await VOTE(votePost("req1", signCancelVoteToken("req1", "c2"), false), ctx("req1"));
  expect((await res.json()).verdict).toBe("keep");
  expect(applyEvent).toHaveBeenCalledWith("j1", { type: "GUARDIAN_SAYS_WRONG" }, "trustee");
});

test("vote: Safe then 2 Not safe → verdict reraise, re-sends SOS keeping alarm_mode", async () => {
  single.cancel_requests = reqRow();
  single.journeys = { alarm_mode: "silent" };
  list.cancel_votes = [{ safe: true, created_at: 1 }, { safe: false, created_at: 2 }, { safe: false, created_at: 3 }];
  (applyEvent as jest.Mock).mockResolvedValue({ state: "CRITICAL", actions: [] });
  const res = await VOTE(votePost("req1", signCancelVoteToken("req1", "c3"), false), ctx("req1"));
  expect((await res.json()).verdict).toBe("reraise");
  expect(applyEvent).toHaveBeenCalledWith("j1", { type: "SOS", mode: "silent" }, "trustee");
});

test("vote: 1 Not safe of 3 → pending, no state change event, request stays open", async () => {
  single.cancel_requests = reqRow();
  single.journeys = { alarm_mode: "siren" };
  list.cancel_votes = [{ safe: false, created_at: 1 }];
  const res = await VOTE(votePost("req1", signCancelVoteToken("req1", "c1"), false), ctx("req1"));
  expect((await res.json()).verdict).toBe("pending");
  expect(applyEvent).toHaveBeenCalledWith("j1", { type: "GUARDIAN_VOTE", safe: false, contactId: "c1" }, "trustee");
  // Never writes resolved_at at all, so a vote can never reopen a closed row.
  expect(updated.filter((u) => u.table === "cancel_requests")).toEqual([{ table: "cancel_requests", verdict: "pending" }]);
});

test("vote: a contact not in asked_contact_ids is forbidden (403)", async () => {
  single.cancel_requests = reqRow();
  const res = await VOTE(votePost("req1", signCancelVoteToken("req1", "stranger"), true), ctx("req1"));
  expect(res.status).toBe(403);
});

test("vote: a token for a different request is forbidden (403)", async () => {
  single.cancel_requests = reqRow();
  const res = await VOTE(votePost("req1", signCancelVoteToken("OTHER", "c1"), true), ctx("req1"));
  expect(res.status).toBe(403);
});

test("vote: a forged/garbage token is forbidden (403)", async () => {
  const res = await VOTE(votePost("req1", "not.a.token", true), ctx("req1"));
  expect(res.status).toBe(403);
});

test("vote: the canceller name is HTML-escaped in the cancelled-by email (no injection)", async () => {
  single.cancel_requests = reqRow();
  single.journeys = { alarm_mode: "siren" };
  single.contacts = { name: "<img src=x onerror=1>" };
  list.contacts = [{ email: "other@x" }];
  list.cancel_votes = [{ safe: true, created_at: 1 }];
  await VOTE(votePost("req1", signCancelVoteToken("req1", "c1"), true), ctx("req1"));
  const call = (sendEmail as jest.Mock).mock.calls.find((c) => c[1] === "Alarm cancelled");
  expect(call).toBeTruthy();
  expect(call![2]).toContain("&lt;img src=x onerror=1&gt;");
  expect(call![2]).not.toContain("<img");
});

test("vote: a duplicate vote recomputing the same resolved verdict does not re-apply (A4)", async () => {
  single.cancel_requests = reqRow({ verdict: "cancel", resolved_at: "2026-09-12T00:00:00Z" });
  single.journey_state = { state: "RESOLVED_MONITORING" };
  list.cancel_votes = [{ safe: true, created_at: 1 }];
  const res = await VOTE(votePost("req1", signCancelVoteToken("req1", "c1"), true), ctx("req1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ verdict: "cancel", state: "RESOLVED_MONITORING" });
  expect(applyEvent).not.toHaveBeenCalled();
  expect(updated).toHaveLength(0);
  expect(inserted).toHaveLength(0);
});

test("vote: write uses an idempotent upsert on (request_id, contact_id)", async () => {
  single.cancel_requests = reqRow();
  single.journeys = { alarm_mode: "siren" };
  list.cancel_votes = [{ safe: true, created_at: 1 }];
  await VOTE(votePost("req1", signCancelVoteToken("req1", "c1"), true), ctx("req1"));
  const u = upserted.find((x) => x.table === "cancel_votes");
  expect(u).toBeTruthy();
  expect(u.o).toMatchObject({ onConflict: "request_id,contact_id", ignoreDuplicates: true });
});

// ---- Fix lane F1 (founder 2026-11-12): T8-T10, the atomic step at the app layer ----
// These check the route's reaction to the step's three answers. The step itself (the SQL) is
// proven by supabase/tests/0036_*.test.sql on a real DB, not here.
test("T8: the step is accepted → the guardian is told cancelled; the other guardians get the cancelled email", async () => {
  single.cancel_requests = reqRow();
  single.journeys = { alarm_mode: "siren" };
  single.contacts = { name: "Mum" };
  list.contacts = [{ email: "other@x" }];
  list.cancel_votes = [{ safe: true, created_at: 1 }];
  const res = await VOTE(votePost("req1", signCancelVoteToken("req1", "c1"), true), ctx("req1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ verdict: "cancel", state: "RESOLVED_MONITORING" });
  expect(applyEvent).toHaveBeenCalledWith("j1", { type: "GUARDIAN_VOTE", safe: true, contactId: "c1" }, "trustee", undefined, { atomicClaim: { requestId: "req1", claimMode: "open", closeSiblings: true } });
  const call = (sendEmail as jest.Mock).mock.calls.find((c) => c[1] === "Alarm cancelled");
  expect(call).toBeTruthy();
  expect(call![0]).toEqual(["other@x"]);
});

test("T9: the step refuses (the row was closed under us) → refused, no cancelled email", async () => {
  single.cancel_requests = reqRow(); // still open when the route checks the window
  single.journeys = { alarm_mode: "siren" };
  single.journey_state = { state: "CRITICAL" };
  list.cancel_votes = [{ safe: true, created_at: 1 }];
  (applyEvent as jest.Mock).mockResolvedValue({ state: "CRITICAL", actions: [], claimed: false, outcome: "claim_lost" });
  const res = await VOTE(votePost("req1", signCancelVoteToken("req1", "c1"), true), ctx("req1"));
  expect(res.status).toBe(410); // the row now reads not-cancel, so the vote is refused
  expect(sendEmail).not.toHaveBeenCalled();
});

test("T10: the step fails → nobody is told cancelled, the error is logged (500)", async () => {
  single.cancel_requests = reqRow();
  single.journeys = { alarm_mode: "siren" };
  single.journey_state = { state: "CRITICAL" };
  list.cancel_votes = [{ safe: true, created_at: 1 }];
  // applyEvent is mocked here (no real rpc). The real failure arrives as the rpc returning
  // { data: null, error } (supabase-js never throws); applyEvent logs it and throws this, which
  // the route turns into a 500. The real rpc-error path (real applyEvent) is covered in
  // guardianEnd.test.tsx. Here we check the route's reaction: 500, no email, logged.
  (applyEvent as jest.Mock).mockRejectedValue(new Error("cancel_resolve_and_move failed: function cancel_resolve_and_move does not exist"));
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  const res = await VOTE(votePost("req1", signCancelVoteToken("req1", "c1"), true), ctx("req1"));
  expect(res.status).toBe(500);
  expect(sendEmail).not.toHaveBeenCalled();
  expect(spy).toHaveBeenCalledWith("[cancel-request/vote]", expect.any(Error));
  spy.mockRestore();
});

// ---- Fix lane F2 (founder 2026-11-12): after the emergency word, her account opens no new question ----
// liveDistress runs for real here (guardianEnd is not mocked), reading the in-memory db above.
test("T11: after the emergency word, her account asking to open a new question is refused (409), no guardian messaged", async () => {
  asUser("owner1");
  single.journeys = { owner_id: "owner1", from_label: "A", to_label: "B", alarm_mode: "siren", status: "monitoring" };
  single.journey_state = { state: "CRITICAL" };
  // The emergency word closed her newest request as 'distress': the alarm is live and quiet.
  single.cancel_requests = { id: "r1", verdict: "distress", resolved_at: new Date().toISOString() };
  const res = await OPEN(postJson({ journeyId: "j1", method: "word" }));
  expect(res.status).toBe(409);
  expect(inserted).toHaveLength(0); // no new cancel_requests row
  expect(sendPush).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
  expect(applyEvent).not.toHaveBeenCalled(); // no CANCEL_REQUESTED, nothing moved
});

test("T15: a normal alarm (no emergency word) with the correct word opens the question as today", async () => {
  asUser("owner1");
  single.journeys = { owner_id: "owner1", from_label: "A", to_label: "B", alarm_mode: "siren", status: "monitoring" };
  single.journey_state = { state: "CRITICAL" };
  // No prior request, no 'distress' verdict: liveDistress is false, so the F2 gate does not fire.
  list.contacts = [{ id: "p1", email: "p1@x", linked_user_id: null, tier: "primary", position: 1 }];
  insertReturn.cancel_requests = { id: "req1" };
  const res = await OPEN(postJson({ journeyId: "j1", method: "word" }));
  expect(res.status).toBe(200);
  expect((await res.json()).requestId).toBe("req1");
  expect(inserted.some((i) => i.table === "cancel_requests")).toBe(true);
  expect(applyEvent).toHaveBeenCalledWith("j1", { type: "CANCEL_REQUESTED", method: "word" }, "user");
  expect(sendEmail).toHaveBeenCalled(); // the guardian question went out, as today
});
