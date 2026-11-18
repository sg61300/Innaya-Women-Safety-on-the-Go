jest.mock("@/lib/alerts", () => ({ sendPush: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/events", () => ({ logEvent: jest.fn().mockResolvedValue(undefined) }));
let assignmentRows: any[] = [];
const updates: any[] = [];
jest.mock("@/lib/supabaseAdmin", () => ({ admin: () => ({ from: (t: string) => ({
  select: () => ({ eq: async () => ({ data: t === "monitoring_assignments" ? assignmentRows : [] }) }),
  update: (v: any) => ({ eq: () => ({ eq: async () => { updates.push(v); return { error: null }; } }) }),
}) }) }));
import { reconcilePlan } from "@/lib/monitoring";

afterEach(() => { updates.length = 0; assignmentRows = []; });

test("reconcile activates accepted primary and queues nothing", async () => {
  assignmentRows = [
    { contact_id: "a", requested_at: "1970-01-01T00:00:00Z", responded_at: "1970-01-01T00:00:10Z", response: "accept", last_seen_at: new Date().toISOString(), contacts: { tier: "primary", linked_user_id: "ua" } },
    { contact_id: "b", requested_at: "1970-01-01T00:00:00Z", responded_at: null, response: null, last_seen_at: null, contacts: { tier: "primary", linked_user_id: "ub" } },
  ];
  const p = await reconcilePlan("j1");
  expect(p.active).toEqual(["a"]);
  expect(updates.some((u) => u.active === true)).toBe(true);
});

test("an accepted-but-stale watcher (last_seen_at old) is not activated", async () => {
  const now = Date.now();
  assignmentRows = [
    // accepted 5 min ago but not seen for 5 min → past INACTIVE_MS, not alive
    { contact_id: "a", requested_at: new Date(now - 5 * 60_000).toISOString(), responded_at: new Date(now - 5 * 60_000).toISOString(), response: "accept", last_seen_at: new Date(now - 5 * 60_000).toISOString(), contacts: { tier: "primary", linked_user_id: "ua" } },
    // buffers already requested recently → reconcile does not re-request them
    { contact_id: "z", requested_at: new Date(now - 10_000).toISOString(), responded_at: null, response: null, last_seen_at: null, contacts: { tier: "buffer", linked_user_id: "uz" } },
  ];
  const p = await reconcilePlan("j1");
  expect(p.active).toEqual([]);
  // every row is still written back, all inactive
  expect(updates.every((u) => u.active === false)).toBe(true);
});
