// The original brief test uses jest.mock; the F1/F2/F3 tests below use the
// injectable `deps` parameter (F3) instead of module mocks where that is simpler.
jest.mock("@/lib/events", () => ({ logEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/alerts", () => ({ notifyGuardians: jest.fn().mockResolvedValue(undefined), notifyNearby: jest.fn().mockResolvedValue(undefined) }));
const rows: any[] = [];
jest.mock("@/lib/supabaseAdmin", () => ({ admin: () => ({
  from: (t: string) => ({
    select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: rows.at(-1) ?? null }) }) }), single: async () => ({ data: { ending: false, heightened: false } }) }) }),
    insert: async (r: any) => { if (t === "journey_state") rows.push(r); return { error: null }; },
    update: () => ({ eq: async () => ({ error: null }) }),
  }),
}) }));
import { applyEvent, type ApplyEventDeps } from "@/lib/journeyState";
import { notifyGuardians, notifyNearby } from "@/lib/alerts";

// Fake deps (F3): a configurable in-memory db plus spy alert/log fns.
function makeDeps(opts: { lastState?: string | null; ending?: boolean; heightened?: boolean }) {
  const inserted: any[] = [];
  const updated: any[] = [];
  const db: any = {
    from: (t: string) => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: opts.lastState == null ? null : { state: opts.lastState } }) }) }),
          single: async () => ({ data: { ending: opts.ending ?? false, heightened: opts.heightened ?? false } }),
        }),
      }),
      insert: async (r: any) => { if (t === "journey_state") inserted.push(r); return { error: null }; },
      update: (o: any) => ({ eq: async () => { updated.push({ table: t, ...o }); return { error: null }; } }),
    }),
  };
  const deps: ApplyEventDeps = {
    db,
    logEvent: jest.fn().mockResolvedValue(undefined) as any,
    notifyGuardians: jest.fn().mockResolvedValue(undefined) as any,
    notifyNearby: jest.fn().mockResolvedValue([]) as any,
  };
  return { deps, inserted, updated };
}

test("SAFE + score 3 → CRITICAL, notifies guardians and nearby, persists state", async () => {
  rows.push({ state: "SAFE", journey_id: "j1" });
  const r = await applyEvent("j1", { type: "SCORE", score: 3, reasons: ["weapon"] }, "model");
  expect(r.state).toBe("CRITICAL");
  expect(rows.at(-1)).toMatchObject({ state: "CRITICAL", changed_by: "model" });
  expect(notifyGuardians).toHaveBeenCalled(); expect(notifyNearby).toHaveBeenCalledWith("j1");
});

// F1: heightened is read from the journeys row and gates core escalation.
test("F1: heightened=true in RESOLVED_MONITORING + SCORE 1 → EMERGENCY", async () => {
  const { deps, inserted } = makeDeps({ lastState: "RESOLVED_MONITORING", heightened: true });
  const r = await applyEvent("j1", { type: "SCORE", score: 1, reasons: [] }, "model", deps);
  expect(r.state).toBe("EMERGENCY");
  expect(inserted.at(-1)).toMatchObject({ state: "EMERGENCY" });
  expect(deps.notifyGuardians).toHaveBeenCalled();
});

test("F1: heightened=false in RESOLVED_MONITORING + SCORE 1 → AMBER, not EMERGENCY", async () => {
  const { deps, inserted } = makeDeps({ lastState: "RESOLVED_MONITORING", heightened: false });
  const r = await applyEvent("j1", { type: "SCORE", score: 1, reasons: [] }, "model", deps);
  expect(r.state).toBe("AMBER");
  expect(r.state).not.toBe("EMERGENCY");
  expect(inserted.at(-1)).toMatchObject({ state: "AMBER" });
});

// F1 write-back: the transition that SETS heightened (guardian-confirmed cancel)
// persists heightened=true on the journeys row.
test("F1: guardian-approved cancel (CANCEL_HOLD + first Safe vote) writes heightened=true back to journeys", async () => {
  const { deps, updated } = makeDeps({ lastState: "CANCEL_HOLD", heightened: false });
  const r = await applyEvent("j1", { type: "GUARDIAN_VOTE", safe: true, contactId: "c1" }, "trustee", deps);
  expect(r.state).toBe("RESOLVED_MONITORING");
  expect(updated.some((u) => u.table === "journeys" && u.heightened === true)).toBe(true);
});

// F2: a rejecting nearby fan-out must not fail the request. applyEvent awaits a
// fail-soft notifyNearby (never rejects, see alerts.test.ts) and still returns a
// result with guardians notified, so /api/journey-state returns 200.
test("F2: CRITICAL with fail-soft nearby still notifies guardians and resolves", async () => {
  const { deps } = makeDeps({ lastState: "SAFE" });
  (deps.notifyNearby as jest.Mock).mockResolvedValue([]); // fail-soft contract
  const r = await applyEvent("j1", { type: "SCORE", score: 3, reasons: ["weapon"] }, "model", deps);
  expect(r.state).toBe("CRITICAL");
  expect(deps.notifyGuardians).toHaveBeenCalled();
  expect(deps.notifyNearby).toHaveBeenCalledWith("j1");
});
