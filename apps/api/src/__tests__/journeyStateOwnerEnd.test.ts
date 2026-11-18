// Fix lane F3 (founder 2026-11-12): her own account can never end her own alarm.
// At POST /api/journey-state the owner's GUARDIAN_VOTE safe:true is refused while any alarm is
// still waiting on a guardian (T12 a normal question open, T14 the emergency-word alarm live), and
// is taken only when it merely repeats an end a guardian already made - her phone's in-step echo
// after it saw a guardian cancel (T13), where it changes nothing and no guardian is re-messaged.
//
// These tests drive the REAL applyEvent (journeyState is not mocked) so T13 proves the echo fans
// nothing out: from RESOLVED_MONITORING a GUARDIAN_VOTE is `stay(ctx, "ignored")` in the core
// (packages/core/src/protocol.ts), i.e. no new state row, no journeys write, no guardian notify.
process.env.GUARDIAN_LINK_SECRET = "test-secret";
process.env.APP_BASE_URL = "http://app";

jest.mock("@/lib/auth", () => ({ requireUser: jest.fn() }));
jest.mock("@/lib/events", () => ({ logEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/alerts", () => ({
  ...jest.requireActual("@/lib/alerts"),
  notifyGuardians: jest.fn().mockResolvedValue(undefined),
  notifyNearby: jest.fn().mockResolvedValue([]),
}));

// In-memory admin() db: single[table] feeds .single()/.maybeSingle(); list[table] feeds an awaited
// chain; writes are recorded in inserted/updated. Shared across every admin() call in a test.
const single: Record<string, any> = {};
const list: Record<string, any[]> = {};
const inserted: any[] = [];
const updated: any[] = [];

jest.mock("@/lib/supabaseAdmin", () => ({
  admin: () => ({
    from: (t: string) => {
      const b: any = {
        select: () => b, eq: () => b, in: () => b, is: () => b, order: () => b, limit: () => b,
        single: async () => ({ data: single[t] ?? null }),
        maybeSingle: async () => ({ data: single[t] ?? null }),
        then: (res: any) => res({ data: list[t] ?? null, error: null }),
        insert: (v: any) => { inserted.push({ table: t, ...v }); const p: any = Promise.resolve({ data: null, error: null }); p.select = () => ({ single: async () => ({ data: null }) }); return p; },
        update: (v: any) => ({ eq: () => { updated.push({ table: t, ...v }); const p: any = Promise.resolve({ data: null, error: null }); p.is = () => p; p.eq = () => p; p.select = () => p; return p; } }),
      };
      return b;
    },
  }),
}));

import { POST } from "@/app/api/journey-state/route";
import { requireUser } from "@/lib/auth";
import { notifyGuardians } from "@/lib/alerts";

const asUser = (id: string) => (requireUser as jest.Mock).mockResolvedValue({ id });
const postJson = (body: unknown) => new Request("http://x/api/journey-state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
// Her phone's echo after a guardian cancel (apps/mobile/src/services/cancelWatch.ts:48,54).
const VOTE_SAFE = { type: "GUARDIAN_VOTE", safe: true, contactId: "" };
const stateRows = () => inserted.filter((i) => i.table === "journey_state");

beforeEach(() => {
  jest.clearAllMocks();
  for (const o of [single, list]) for (const k of Object.keys(o)) delete (o as any)[k];
  inserted.length = 0; updated.length = 0;
  asUser("owner1");
  single.journeys = { owner_id: "owner1", status: "monitoring", ending: false, heightened: false, camera_paused_at: null, challenge_kind: null, alarm_mode: "siren" };
});

test("T12: open question, no guardian answer, her account sends Safe -> refused (403), alarm stays on", async () => {
  single.journey_state = { state: "CRITICAL" };
  single.cancel_requests = { id: "r1", verdict: null, resolved_at: null }; // the question is open, unanswered
  const res = await POST(postJson({ journeyId: "j1", event: VOTE_SAFE }));
  expect(res.status).toBe(403);
  expect(stateRows()).toHaveLength(0); // the alarm did not move
  expect(notifyGuardians).not.toHaveBeenCalled();
});

test("T14: the emergency-word alarm is live, her account sends Safe -> refused (403), alarm stays on", async () => {
  single.journey_state = { state: "CRITICAL" };
  single.cancel_requests = { id: "r1", verdict: "distress", resolved_at: new Date().toISOString() };
  const res = await POST(postJson({ journeyId: "j1", event: VOTE_SAFE }));
  expect(res.status).toBe(403);
  expect(stateRows()).toHaveLength(0);
  expect(notifyGuardians).not.toHaveBeenCalled();
});

test("T13: a guardian's Safe already ended it; her phone's in-step Safe is taken (200), nothing changes, no guardian re-messaged", async () => {
  single.journey_state = { state: "RESOLVED_MONITORING" };
  single.cancel_requests = { id: "r1", verdict: "cancel", resolved_at: new Date().toISOString() };
  const res = await POST(postJson({ journeyId: "j1", event: VOTE_SAFE }));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ state: "RESOLVED_MONITORING", actions: [] });
  expect(stateRows()).toHaveLength(0); // no state change
  expect(updated.filter((u) => u.table === "journeys")).toHaveLength(0); // no journeys write
  expect(notifyGuardians).not.toHaveBeenCalled(); // no repeat alerts/emails
});
