// QA s20 guardian-mesh addendum, item (2): api-level coverage of the trustee rota
// (PRD F13 + "Trustee rota") through reconcilePlan, for the cases the two existing
// monitoring.test.ts tests do not exercise: 4th accepting primary queued, promotion
// when an active primary goes stale, buffer tier requested when primaries are
// exhausted, none-available admin alert, decline ignored, and idempotent re-reconcile.
// Richer db mock than monitoring.test.ts because these paths hit insert()/upsert()
// (admin alert + requestTier), which the minimal mock there does not support.
jest.mock("@/lib/alerts", () => ({ sendPush: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/events", () => ({ logEvent: jest.fn().mockResolvedValue(undefined) }));

interface State { rows: any[]; contactsByTier: Record<string, any[]>; journey: any }
const capture = { updates: [] as any[], upserts: [] as any[], alerts: [] as any[] };
let state: State;

function resolveList(table: string, eqs: [string, any][]) {
  if (table === "monitoring_assignments") return state.rows;
  if (table === "contacts") {
    const tier = eqs.find((e) => e[0] === "tier")?.[1];
    return tier ? state.contactsByTier[tier] ?? [] : [];
  }
  return []; // profiles / events
}

jest.mock("@/lib/supabaseAdmin", () => ({
  admin: () => ({
    from: (table: string) => {
      const eqs: [string, any][] = [];
      const chain: any = {
        select: () => chain,
        eq: (c: string, v: any) => { eqs.push([c, v]); return chain; },
        in: (c: string, v: any) => { eqs.push([c, v]); return chain; },
        single: async () => ({ data: table === "journeys" ? state.journey : null }),
        maybeSingle: async () => ({ data: null }),
        upsert: async (row: any) => { capture.upserts.push({ table, row }); return { error: null }; },
        insert: async (row: any) => { if (table === "alerts") capture.alerts.push(row); return { data: { id: "e1" }, error: null }; },
        update: (v: any) => { capture.updates.push({ table, v }); const u: any = { eq: () => u, in: async () => ({ error: null }), then: (r: any, j: any) => Promise.resolve({ error: null }).then(r, j) }; return u; },
        then: (r: any, j: any) => Promise.resolve({ data: resolveList(table, eqs) }).then(r, j),
      };
      return chain;
    },
  }),
}));

import { reconcilePlan } from "@/lib/monitoring";

const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const primary = (id: string, opts: { resp?: "accept" | "decline" | null; respAgo?: number; seenAgo?: number | null; reqAgo?: number } = {}) => ({
  contact_id: id,
  requested_at: iso(now - (opts.reqAgo ?? 10_000)),
  responded_at: opts.resp === "accept" || opts.resp === "decline" ? iso(now - (opts.respAgo ?? 5_000)) : null,
  response: opts.resp ?? null,
  last_seen_at: opts.seenAgo === null ? null : iso(now - (opts.seenAgo ?? 5_000)),
  contacts: { tier: "primary", linked_user_id: "u_" + id },
});

beforeEach(() => {
  capture.updates.length = 0; capture.upserts.length = 0; capture.alerts.length = 0;
  state = { rows: [], contactsByTier: {}, journey: { owner_id: "owner1", from_label: "A", to_label: "B", start_at: iso(now), eta_seconds: 600, profiles: { name: "Asha" } } };
});

test("decline is ignored: a declined primary is never active or queued", async () => {
  state.rows = [primary("a", { resp: "accept", respAgo: 100 }), primary("d", { resp: "decline" })];
  const p = await reconcilePlan("j1");
  expect(p.active).toEqual(["a"]);
  expect(p.queued).toEqual([]);
});

test("4th accepting primary is queued, first 3 active", async () => {
  state.rows = ["a", "b", "c", "e"].map((id, i) => primary(id, { resp: "accept", respAgo: 100 - i }));
  const p = await reconcilePlan("j1");
  expect(p.active).toHaveLength(3);
  expect(p.queued).toHaveLength(1);
  expect([...p.active, ...p.queued].sort()).toEqual(["a", "b", "c", "e"]);
});

test("promotion: when an active primary goes stale, a fresh accepted one takes its slot", async () => {
  // a accepted earliest but last seen 5 min ago (past INACTIVE_MS) → not alive.
  state.rows = [
    primary("a", { resp: "accept", respAgo: 300, seenAgo: 300_000 }),
    primary("b", { resp: "accept", respAgo: 200 }),
    primary("c", { resp: "accept", respAgo: 150 }),
    primary("e", { resp: "accept", respAgo: 100 }),
  ];
  const p = await reconcilePlan("j1");
  expect(p.active).toHaveLength(3);
  expect(p.active).not.toContain("a"); // stale one dropped
  expect(p.active).toContain("e");     // the 4th is promoted in
});

test("buffer tier is requested when no primary is available and window elapsed", async () => {
  // both primaries declined, request window (>180s) elapsed, no buffer rows yet.
  state.rows = [primary("a", { resp: "decline", reqAgo: 240_000 }), primary("b", { resp: "decline", reqAgo: 240_000 })];
  state.contactsByTier = { buffer: [{ id: "bf1", linked_user_id: "ubf1" }, { id: "bf2", linked_user_id: null }] };
  const p = await reconcilePlan("j1");
  expect(p.active).toEqual([]);
  expect(p.requestBuffers).toBe(true);
  // requestTier("buffer") ran and upserted an assignment row per buffer contact.
  const bufferUpserts = capture.upserts.filter((u) => u.table === "monitoring_assignments");
  expect(bufferUpserts).toHaveLength(2);
});

test("none-available raises an admin alert", async () => {
  // primaries + buffers all present, buffers requested >180s ago, none accepted.
  state.rows = [
    primary("a", { resp: "decline", reqAgo: 400_000 }),
    { contact_id: "bf1", requested_at: iso(now - 240_000), responded_at: null, response: null, last_seen_at: null, contacts: { tier: "buffer", linked_user_id: "ubf1" } },
  ];
  const p = await reconcilePlan("j1");
  expect(p.noneAvailable).toBe(true);
  expect(capture.alerts).toHaveLength(1);
  expect(capture.alerts[0]).toMatchObject({ recipient: "admin", channel: "admin", journey_id: "j1" });
});

test("idempotent: re-reconcile with buffers already requested does not re-request them", async () => {
  state.rows = [
    primary("a", { resp: "decline", reqAgo: 400_000 }),
    { contact_id: "bf1", requested_at: iso(now - 20_000), responded_at: null, response: null, last_seen_at: null, contacts: { tier: "buffer", linked_user_id: "ubf1" } },
  ];
  const p1 = await reconcilePlan("j1");
  const upsertsAfter1 = capture.upserts.length;
  const p2 = await reconcilePlan("j1");
  expect(p2).toEqual(p1);               // same plan on re-run
  expect(p1.requestBuffers).toBe(false); // buffers already requested → not re-requested
  expect(capture.upserts.length).toBe(upsertsAfter1); // no new buffer requests
});
