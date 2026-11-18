// F2: notifyNearby must fail soft when the `nearby_responders` RPC is absent or
// errors, so /api/journey-state still returns 200 after state + guardian fan-out.
const logEvent = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/events", () => ({ logEvent }));
let rpcMode: "error" | "throw" = "error";
const insertedAlerts: any[] = [];
jest.mock("@/lib/supabaseAdmin", () => ({ admin: () => ({
  rpc: async () => {
    if (rpcMode === "throw") throw new Error("connection reset");
    return { data: null, error: { message: "function nearby_responders does not exist" } };
  },
  from: () => ({ insert: async (r: any) => { insertedAlerts.push(r); return { error: null }; } }),
}) }));
import { notifyNearby } from "@/lib/alerts";

afterEach(() => { logEvent.mockClear(); insertedAlerts.length = 0; });

test("F2: RPC returns an error → returns [], logs alert_failed, inserts no alerts", async () => {
  rpcMode = "error";
  const r = await notifyNearby("j1");
  expect(r).toEqual([]);
  expect(insertedAlerts).toHaveLength(0);
  expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ journeyId: "j1", type: "alert_failed" }));
});

test("F2: RPC throws → returns [] without rejecting", async () => {
  rpcMode = "throw";
  await expect(notifyNearby("j1")).resolves.toEqual([]);
  expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "alert_failed" }));
});
