// Fix lane D3-5 (founder Q116): the emergency word while a cancel waits.
jest.mock("@/lib/supabaseAdmin", () => ({ admin: jest.fn() }));
jest.mock("@/lib/alerts", () => ({ notifyGuardians: jest.fn(), notifyNearby: jest.fn() }));
jest.mock("@/lib/events", () => ({ logEvent: jest.fn() }));
import { applyEvent } from "@/lib/journeyState";

function setup(open: boolean) {
  const updates: any[] = [];
  const inserts: any[] = [];
  const db: any = {
    from: (t: string) => {
      const b: any = {
        select: () => b, eq: () => b, is: () => b, order: () => b, limit: () => b,
        maybeSingle: async () => ({ data: t === "journey_state" ? { state: "CRITICAL" } : t === "cancel_requests" && open ? { id: "r1" } : null }),
        single: async () => ({ data: { ending: false, heightened: false, camera_paused_at: null, challenge_kind: null, alarm_mode: "siren" } }),
        update: (v: any) => { updates.push({ t, ...v }); return b; },
        insert: (v: any) => { inserts.push({ t, ...v }); return b; },
        then: (res: any) => res({ data: null, error: null }),
      };
      return b;
    },
  };
  const deps = { db, logEvent: jest.fn(), notifyGuardians: jest.fn(), notifyNearby: jest.fn() };
  return { deps, updates, inserts };
}

test("closes the request quietly, alerts guardians again, nearby not called, state unchanged", async () => {
  const { deps, updates, inserts } = setup(true);
  const r = await applyEvent("j1", { type: "KEYWORD", kind: "emergency" }, "user", deps as any);
  expect(r.state).toBe("CRITICAL");
  expect(updates.find((u) => u.t === "cancel_requests")).toMatchObject({ verdict: "distress" });
  expect(updates.find((u) => u.t === "cancel_requests").resolved_at).toBeTruthy();
  expect(deps.notifyGuardians).toHaveBeenCalledTimes(1);
  expect(deps.notifyGuardians).toHaveBeenCalledWith("j1", "CRITICAL", expect.any(String), expect.any(String));
  expect(deps.notifyNearby).not.toHaveBeenCalled();
  expect(inserts.filter((i) => i.t === "journey_state")).toHaveLength(0);
});

test("no request waiting: the word on a CRITICAL alarm stays a no-op, as today", async () => {
  const { deps, updates } = setup(false);
  await applyEvent("j1", { type: "KEYWORD", kind: "emergency" }, "user", deps as any);
  expect(updates.filter((u) => u.t === "cancel_requests")).toHaveLength(0);
  expect(deps.notifyGuardians).not.toHaveBeenCalled();
});

test("danger score 3 while waiting changes nothing (reported, not changed)", async () => {
  const { deps, updates } = setup(true);
  await applyEvent("j1", { type: "SCORE", score: 3, reasons: [] } as any, "user", deps as any);
  expect(updates.filter((u) => u.t === "cancel_requests")).toHaveLength(0);
  expect(deps.notifyGuardians).not.toHaveBeenCalled();
});
