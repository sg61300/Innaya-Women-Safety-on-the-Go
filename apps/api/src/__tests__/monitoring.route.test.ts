// QA s20 guardian-mesh addendum, item (3): the /api/monitoring route must (a) reject
// unauthenticated callers and (b) let a contact touch ONLY its own assignment rows.
// Real Supabase-JWT verification is covered by auth.test.ts; here requireUser is
// mocked so we can exercise the route's own auth handling and its DB scoping. When
// mockUser is null the mock throws the same 401 Response the real requireUser throws.
let mockUser: { id: string } | null = { id: "u1" };
jest.mock("@/lib/auth", () => ({
  requireUser: jest.fn(async () => {
    if (!mockUser) throw new Response("unauthorized", { status: 401 });
    return mockUser;
  }),
}));

const mockReconcile = jest.fn(async (_j: string) => ({ active: [], queued: [], requestBuffers: false, noneAvailable: false }));
const mockRequestTier = jest.fn(async (_j: string, _t: string) => {});
jest.mock("@/lib/monitoring", () => ({ reconcilePlan: (j: string) => mockReconcile(j), requestTier: (j: string, t: string) => mockRequestTier(j, t) }));

// Capture the exact filter the respond/heartbeat update is scoped by.
let capturedInIds: string[] | null = null;
let contactsForUser: { id: string }[] = [];
// The owner-scope check on the "request" branch loads journeys.owner_id. null = unknown journey.
let journeyOwner: { owner_id: string } | null = null;
jest.mock("@/lib/supabaseAdmin", () => ({
  admin: () => ({
    from: (t: string) => {
      if (t === "contacts") {
        return { select: () => ({ eq: async (_c: string, _v: string) => ({ data: contactsForUser }) }) };
      }
      if (t === "journeys") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: journeyOwner }) }) }) };
      }
      // monitoring_assignments
      return {
        update: () => ({ eq: () => ({ in: async (_c: string, ids: string[]) => { capturedInIds = ids; return { error: null }; } }) }),
      };
    },
  }),
}));

import { POST } from "@/app/api/monitoring/route";

const req = (body: unknown) => new Request("http://x/api/monitoring", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => { mockUser = { id: "u1" }; capturedInIds = null; contactsForUser = []; journeyOwner = null; mockReconcile.mockClear(); mockRequestTier.mockClear(); });

test("unauthenticated caller → 401", async () => {
  mockUser = null;
  const res = await POST(req({ action: "request", journeyId: "j1" }));
  expect(res.status).toBe(401);
});

test("missing journeyId → 400", async () => {
  const res = await POST(req({ action: "respond", response: "accept" }));
  expect(res.status).toBe(400);
});

test("respond is scoped to the caller's own contact ids only", async () => {
  contactsForUser = [{ id: "c1" }]; // u1 is linked to contact c1 only
  await POST(req({ action: "respond", journeyId: "j1", response: "accept" }));
  // The update .in() filter must be exactly u1's own contact ids — never another
  // guardian's assignment. A contact cannot accept/decline on someone else's row.
  expect(capturedInIds).toEqual(["c1"]);
});

test("a contact linked to no rows can update nothing (empty scope)", async () => {
  contactsForUser = [];
  await POST(req({ action: "respond", journeyId: "j1", response: "accept" }));
  expect(capturedInIds).toEqual([]); // .in("contact_id", []) matches zero rows
});

// D1 (s20 IDOR): the "request" branch pushes monitoring to a journey's guardians
// and returns its watcher plan, so a non-owner must never reach requestTier/reconcile.
test("request by a non-owner → 403, no requestTier/reconcile", async () => {
  journeyOwner = { owner_id: "someone-else" }; // journey exists but u1 does not own it
  const res = await POST(req({ action: "request", journeyId: "j1" }));
  expect(res.status).toBe(403);
  expect(mockRequestTier).not.toHaveBeenCalled();
  expect(mockReconcile).not.toHaveBeenCalled();
});

test("request by the owner → 200 and runs requestTier + reconcile", async () => {
  journeyOwner = { owner_id: "u1" };
  const res = await POST(req({ action: "request", journeyId: "j1" }));
  expect(res.status).toBe(200);
  expect(mockRequestTier).toHaveBeenCalledWith("j1", "primary");
  expect(mockReconcile).toHaveBeenCalledWith("j1");
});

test("request for an unknown journey → 404, no requestTier/reconcile", async () => {
  journeyOwner = null; // no such journey
  const res = await POST(req({ action: "request", journeyId: "nope" }));
  expect(res.status).toBe(404);
  expect(mockRequestTier).not.toHaveBeenCalled();
  expect(mockReconcile).not.toHaveBeenCalled();
});
