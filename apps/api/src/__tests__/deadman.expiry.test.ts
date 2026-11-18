// ADR-042 / R47c + R47d: the dead-man watchdog also expires a silent alarm and
// pushes the guardian battery notice. This test drives the SELECTION logic in the
// route; expireSilentAlarm / maybeBatteryPush are unit-tested in monitoring.test.
jest.mock("@/lib/journeyState", () => ({ applyEvent: jest.fn().mockResolvedValue({ state: "CRITICAL", actions: [] }) }));
jest.mock("@/lib/monitoring", () => ({
  ALARM_EXPIRY_MS: 15 * 60_000,
  expireSilentAlarm: jest.fn().mockResolvedValue(true),
  maybeBatteryPush: jest.fn().mockResolvedValue(0),
}));

let snapshot: any[] = [];
jest.mock("@/lib/supabaseAdmin", () => ({ admin: () => ({ rpc: async () => ({ data: snapshot }) }) }));

import { GET } from "@/app/api/cron/deadman/route";
import { applyEvent } from "@/lib/journeyState";
import { expireSilentAlarm, maybeBatteryPush } from "@/lib/monitoring";

const MIN = 60_000;
const ago = (m: number) => new Date(Date.now() - m * MIN).toISOString();
const call = () => GET(new Request("http://x/api/cron/deadman", { headers: { authorization: "Bearer s" } }));

beforeEach(() => {
  process.env.CRON_SECRET = "s";
  (applyEvent as jest.Mock).mockClear();
  (expireSilentAlarm as jest.Mock).mockClear();
  (maybeBatteryPush as jest.Mock).mockClear();
});
afterEach(() => { delete process.env.CRON_SECRET; });

test("CRITICAL silent 16 min (hb + frame), alarm entered 20 min ago → expired once, not escalated", async () => {
  snapshot = [{ journey_id: "j1", state: "CRITICAL", last_heartbeat_at: ago(16), last_frame_at: ago(16), state_changed_at: ago(20), battery_low: false }];
  const res = await call();
  expect(await res.json()).toMatchObject({ expired: 1 });
  expect(expireSilentAlarm).toHaveBeenCalledTimes(1);
  expect(expireSilentAlarm).toHaveBeenCalledWith("j1", expect.any(Number), expect.any(Number));
  expect(applyEvent).not.toHaveBeenCalled();
});

test("EMERGENCY with no frame since alarm start (null), hb silent, alarm 25 min old → expired", async () => {
  snapshot = [{ journey_id: "j1", state: "EMERGENCY", last_heartbeat_at: ago(20), last_frame_at: null, state_changed_at: ago(25), battery_low: false }];
  await call();
  expect(expireSilentAlarm).toHaveBeenCalledTimes(1);
});

test("heartbeat 10 min ago → not silent → untouched", async () => {
  snapshot = [{ journey_id: "j1", state: "CRITICAL", last_heartbeat_at: ago(10), last_frame_at: ago(30), state_changed_at: ago(20), battery_low: false }];
  await call();
  expect(expireSilentAlarm).not.toHaveBeenCalled();
});

test("frame 5 min ago but heartbeat 20 min ago → untouched (a recent frame is a signal)", async () => {
  snapshot = [{ journey_id: "j1", state: "CRITICAL", last_heartbeat_at: ago(20), last_frame_at: ago(5), state_changed_at: ago(20), battery_low: false }];
  await call();
  expect(expireSilentAlarm).not.toHaveBeenCalled();
});

// C1-1: silence is measured from the LATER of last heartbeat, last frame, and the
// moment the alarm state began, a just-raised alarm must not expire on the next tick.
test("C1-1: alarm entered 1 min ago with no hb/frame yet → untouched", async () => {
  snapshot = [{ journey_id: "j1", state: "CRITICAL", last_heartbeat_at: null, last_frame_at: null, state_changed_at: ago(1), battery_low: false }];
  await call();
  expect(expireSilentAlarm).not.toHaveBeenCalled();
});

test("C1-1: alarm entered 16 min ago, no hb/frame ever → expired", async () => {
  snapshot = [{ journey_id: "j1", state: "CRITICAL", last_heartbeat_at: null, last_frame_at: null, state_changed_at: ago(16), battery_low: false }];
  await call();
  expect(expireSilentAlarm).toHaveBeenCalledTimes(1);
});

test("C1-1: hb 16 min ago but alarm entered 5 min ago → untouched (state change is a signal)", async () => {
  snapshot = [{ journey_id: "j1", state: "CRITICAL", last_heartbeat_at: ago(16), last_frame_at: null, state_changed_at: ago(5), battery_low: false }];
  await call();
  expect(expireSilentAlarm).not.toHaveBeenCalled();
});

test("SAFE journey silent 20 min → never expires (verdict path handles SAFE)", async () => {
  snapshot = [{ journey_id: "j1", state: "SAFE", last_heartbeat_at: ago(20), last_frame_at: null, state_changed_at: ago(20), battery_low: false }];
  await call();
  expect(expireSilentAlarm).not.toHaveBeenCalled();
});

test("last_frame_at absent (migration 0024 not applied) → never expires", async () => {
  snapshot = [{ journey_id: "j1", state: "CRITICAL", last_heartbeat_at: ago(30), state_changed_at: ago(30), battery_low: false }];
  await call();
  expect(expireSilentAlarm).not.toHaveBeenCalled();
});

test("state_changed_at absent (migration 0024 not applied) → never expires", async () => {
  snapshot = [{ journey_id: "j1", state: "CRITICAL", last_heartbeat_at: ago(30), last_frame_at: ago(30), battery_low: false }];
  await call();
  expect(expireSilentAlarm).not.toHaveBeenCalled();
});

test("battery present → maybeBatteryPush is offered the rounded percent", async () => {
  snapshot = [{ journey_id: "j1", state: "SAFE", last_heartbeat_at: ago(1), last_frame_at: ago(1), battery: 0.19, battery_low: false }];
  await call();
  expect(maybeBatteryPush).toHaveBeenCalledWith("j1", 19, "SAFE");
});

test("an already-expired journey is absent from the snapshot → idempotent (no call)", async () => {
  snapshot = []; // monitoring_snapshot only returns status='monitoring'
  const res = await call();
  expect(await res.json()).toMatchObject({ expired: 0 });
  expect(expireSilentAlarm).not.toHaveBeenCalled();
});
