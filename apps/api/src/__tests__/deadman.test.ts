jest.mock("@/lib/journeyState", () => ({ applyEvent: jest.fn().mockResolvedValue({ state: "CRITICAL", actions: [] }) }));
jest.mock("@/lib/supabaseAdmin", () => ({ admin: () => ({ rpc: async () => ({ data: [
  { journey_id: "j1", state: "SAFE", last_heartbeat_at: new Date(Date.now() - 45_000).toISOString(), battery_low: false },
  { journey_id: "j2", state: "SAFE", last_heartbeat_at: new Date(Date.now() - 10_000).toISOString(), battery_low: false },
] }) }) }));
import { GET, POST } from "@/app/api/cron/deadman/route";
import { applyEvent } from "@/lib/journeyState";

afterEach(() => {
  (applyEvent as jest.Mock).mockClear();
  delete process.env.CRON_SECRET;
});

test("only stale journeys escalate", async () => {
  process.env.CRON_SECRET = "s";
  const res = await GET(new Request("http://x/api/cron/deadman", { headers: { authorization: "Bearer s" } }));
  expect(res.status).toBe(200);
  expect(applyEvent).toHaveBeenCalledTimes(1);
  expect(applyEvent).toHaveBeenCalledWith("j1", { type: "HEARTBEAT_GAP" }, "server_deadman");
});

test("rejects a missing bearer with 401", async () => {
  process.env.CRON_SECRET = "s";
  const res = await GET(new Request("http://x/api/cron/deadman"));
  expect(res.status).toBe(401);
  expect(applyEvent).not.toHaveBeenCalled();
});

test("rejects an incorrect bearer with 401", async () => {
  process.env.CRON_SECRET = "s";
  const res = await GET(new Request("http://x/api/cron/deadman", { headers: { authorization: "Bearer wrong" } }));
  expect(res.status).toBe(401);
  expect(applyEvent).not.toHaveBeenCalled();
});

test("accepts POST with the bearer (pg_net calls net.http_post, migration 0006/0011)", async () => {
  process.env.CRON_SECRET = "s";
  const res = await POST(new Request("http://x/api/cron/deadman", { method: "POST", headers: { authorization: "Bearer s" } }));
  expect(res.status).toBe(200);
  expect(applyEvent).toHaveBeenCalledTimes(1);
});
