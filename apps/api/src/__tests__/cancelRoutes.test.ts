// Task 29b, /api/cancel-attempt (owner) and /api/cancel-confirm (guardian).
jest.mock("@/lib/auth", () => ({ requireUser: jest.fn() }));
jest.mock("@/lib/alerts", () => ({ sendPush: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/events", () => ({ logEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/journeyState", () => ({ applyEvent: jest.fn() }));

// Configurable in-memory admin() db. `mock`-prefixed so the jest.mock factory may
// close over it. single()/maybeSingle() read per-table fixtures; writes are recorded.
const mockState: { single: any; maybe: any; insertReturn: any } = { single: {}, maybe: {}, insertReturn: {} };
const mockInserted: any[] = [];
const mockUpdated: any[] = [];
const mockRpc = jest.fn();
jest.mock("@/lib/supabaseAdmin", () => ({
  admin: () => ({
    rpc: (...a: any[]) => mockRpc(...a),
    from: (t: string) => {
      const b: any = {
        select: () => b,
        eq: () => b,
        is: () => b,
        order: () => b,
        limit: () => b,
        single: async () => ({ data: mockState.single?.[t] ?? null }),
        maybeSingle: async () => ({ data: mockState.maybe?.[t] ?? null }),
        insert: (v: any) => {
          mockInserted.push({ table: t, ...v });
          return { select: () => ({ single: async () => ({ data: mockState.insertReturn?.[t] ?? null }) }) };
        },
        update: (v: any) => ({
          eq: async () => {
            mockUpdated.push({ table: t, ...v });
            return { error: null };
          },
        }),
      };
      return b;
    },
  }),
}));

import { POST as CONFIRM } from "@/app/api/cancel-confirm/route";
import { requireUser } from "@/lib/auth";
import { sendPush } from "@/lib/alerts";
import { logEvent } from "@/lib/events";
import { applyEvent } from "@/lib/journeyState";

const post = (body: unknown) => new Request("http://x/api", { method: "POST", body: JSON.stringify(body) });
const asUser = (id: string) => (requireUser as jest.Mock).mockResolvedValue({ id });

beforeEach(() => {
  jest.clearAllMocks();
  mockState.single = {};
  mockState.maybe = {};
  mockState.insertReturn = {};
  mockInserted.length = 0;
  mockUpdated.length = 0;
});

// ADR-043 (s23 I7): /api/cancel-attempt is retired (ADR-014 gate 2 — the
// two-password guardian-call starter). Its tests are removed with the route.
// Only the EMERGENCY "I'm safe" guardian-confirm path below survives.

// ---- /api/cancel-confirm ----
test("confirm: the owner cannot self-confirm (403)", async () => {
  asUser("owner1");
  mockState.single = { journeys: { owner_id: "owner1" } };
  const res = await CONFIRM(post({ journeyId: "j1", result: "safe" }));
  expect(res.status).toBe(403);
});

test("confirm: a stranger (not active, not linked) is forbidden (403)", async () => {
  asUser("stranger");
  mockRpc.mockResolvedValue({ data: null });
  mockState.single = { journeys: { owner_id: "owner1" } };
  mockState.maybe = { contacts: null };
  const res = await CONFIRM(post({ journeyId: "j1", result: "safe" }));
  expect(res.status).toBe(403);
});

test("confirm: guardian in EMERGENCY, safe → writes the cancel_calls row (ADR-043 keeps only this EMERGENCY path)", async () => {
  asUser("g1");
  mockRpc.mockResolvedValue({ data: true });
  mockState.single = { journeys: { owner_id: "owner1" } };
  mockState.maybe = { contacts: { id: "c1" }, cancel_calls: { id: "cc1" }, journey_state: { state: "EMERGENCY" } };
  (applyEvent as jest.Mock).mockResolvedValue({ state: "AMBER", actions: [] });
  const res = await CONFIRM(post({ journeyId: "j1", result: "safe" }));
  expect(res.status).toBe(200);
  expect(mockUpdated.some((u) => u.table === "cancel_calls" && u.result === "safe")).toBe(true);
});

test("confirm: guardian in EMERGENCY, safe → CHALLENGE_PASSED { guardianConfirmed: true }", async () => {
  asUser("g1");
  mockRpc.mockResolvedValue({ data: true });
  mockState.single = { journeys: { owner_id: "owner1" } };
  mockState.maybe = { contacts: { id: "c1" }, cancel_calls: { id: "cc1" }, journey_state: { state: "EMERGENCY" } };
  (applyEvent as jest.Mock).mockResolvedValue({ state: "AMBER", actions: [] });
  const res = await CONFIRM(post({ journeyId: "j1", result: "safe" }));
  expect(res.status).toBe(200);
  expect(applyEvent).toHaveBeenCalledWith("j1", { type: "CHALLENGE_PASSED", guardianConfirmed: true }, "trustee");
});

test("confirm: guardian in EMERGENCY, wrong → SOS", async () => {
  asUser("g1");
  mockRpc.mockResolvedValue({ data: true });
  mockState.single = { journeys: { owner_id: "owner1" } };
  mockState.maybe = { contacts: { id: "c1" }, cancel_calls: { id: "cc1" }, journey_state: { state: "EMERGENCY" } };
  (applyEvent as jest.Mock).mockResolvedValue({ state: "CRITICAL", actions: [] });
  const res = await CONFIRM(post({ journeyId: "j1", result: "wrong" }));
  expect(res.status).toBe(200);
  expect(applyEvent).toHaveBeenCalledWith("j1", { type: "SOS" }, "trustee");
});

test("confirm: no open row → inserts one (EMERGENCY path); linked-contact auth without an active assignment", async () => {
  asUser("g1");
  mockRpc.mockResolvedValue({ data: null }); // not an active guardian…
  mockState.single = { journeys: { owner_id: "owner1" } };
  mockState.maybe = { contacts: { id: "c1" }, cancel_calls: null, journey_state: { state: "EMERGENCY" } }; // …but linked
  (applyEvent as jest.Mock).mockResolvedValue({ state: "AMBER", actions: [] });
  const res = await CONFIRM(post({ journeyId: "j1", result: "safe" }));
  expect(res.status).toBe(200);
  expect(mockInserted.some((i) => i.table === "cancel_calls" && i.result === "safe" && i.contact_id === "c1")).toBe(true);
  expect(mockUpdated.some((u) => u.table === "cancel_calls")).toBe(false);
});
