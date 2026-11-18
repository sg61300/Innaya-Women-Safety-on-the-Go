// ADR-042 / R47c + R47d unit tests for the expiry + guardian-battery fan-out.
// A tiny queue-backed Supabase builder feeds results in call order; sendPush and
// logEvent are injected jest.fns so we assert copy and counts directly.
import { expireSilentAlarm, maybeBatteryPush } from "@/lib/monitoring";

type Res = { data: any };
function makeDb(queue: Res[]) {
  let i = 0;
  const updates: any[] = [];
  const next = () => Promise.resolve(queue[i++] ?? { data: null });
  const b: any = {
    _updates: updates,
    from: () => b,
    select: () => b,
    update: (v: any) => { updates.push(v); return b; },
    insert: () => b,
    eq: () => b,
    in: () => b,
    single: () => next(),
    maybeSingle: () => next(),
    then: (res: any, rej: any) => next().then(res, rej),
  };
  return b;
}
const deps = (db: any) => ({ db, sendPush: jest.fn().mockResolvedValue(undefined), logEvent: jest.fn().mockResolvedValue(undefined) });

test("expireSilentAlarm: status→expired, alarm_expired event, owner + guardian pushes", async () => {
  const db = makeDb([
    { data: { owner_id: "o1", profiles: { name: "Asha Rao" } } }, // journeys.single
    { data: {} },                                                   // journeys.update
    { data: { expo_push_token: "OWNER" } },                         // owner profile
    { data: [{ contact_id: "c1" }] },                               // active assignments
    { data: [{ linked_user_id: "u1" }] },                           // contacts
    { data: [{ expo_push_token: "GUARD" }] },                       // guardian profiles
  ]);
  const d = deps(db);
  const now = Date.parse("2026-09-06T04:30:00Z"); // 10:00 IST
  await expireSilentAlarm("j1", now - 20 * 60_000, now, d);

  expect(db._updates).toContainEqual({ status: "expired" });
  expect(d.logEvent).toHaveBeenCalledWith(expect.objectContaining({ journeyId: "j1", type: "alarm_expired" }));
  expect(d.sendPush).toHaveBeenCalledTimes(2);
  const owner = d.sendPush.mock.calls[0];
  expect(owner[0]).toEqual(["OWNER"]);
  expect(owner[2]).toMatch(/expired at \d\d:\d\d after 15 min with no signal/);
  const guard = d.sendPush.mock.calls[1];
  expect(guard[0]).toEqual(["GUARD"]);
  expect(guard[2]).toContain("Asha's phone has sent nothing for 15 min");
});

test("expireSilentAlarm: missing journey → no writes, no pushes", async () => {
  const db = makeDb([{ data: null }]);
  const d = deps(db);
  await expireSilentAlarm("j1", null, Date.now(), d);
  expect(d.sendPush).not.toHaveBeenCalled();
  expect(db._updates).toHaveLength(0);
});

test("maybeBatteryPush: 20 % crosses → one guardian push + battery_alert event", async () => {
  const db = makeDb([
    { data: [] },                                    // prior battery_alert events
    { data: { profiles: { name: "Asha Rao" } } },    // journeys name
    { data: [{ contact_id: "c1" }] },
    { data: [{ linked_user_id: "u1" }] },
    { data: [{ expo_push_token: "GUARD" }] },
  ]);
  const d = deps(db);
  const n = await maybeBatteryPush("j1", 20, "SAFE", d);
  expect(n).toBe(1);
  expect(d.logEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "battery_alert", payload: { threshold: 20, battery: 20 } }));
  expect(d.sendPush).toHaveBeenCalledTimes(1);
  expect(d.sendPush.mock.calls[0][2]).toContain("at 20%");
});

test("maybeBatteryPush: 21 % → above threshold → no push", async () => {
  const db = makeDb([{ data: [] }]);
  const d = deps(db);
  expect(await maybeBatteryPush("j1", 21, "SAFE", d)).toBe(0);
  expect(d.sendPush).not.toHaveBeenCalled();
});

test("maybeBatteryPush: 20 % but already alerted → idempotent (no push)", async () => {
  const db = makeDb([{ data: [{ payload: { threshold: 20 } }] }]);
  const d = deps(db);
  expect(await maybeBatteryPush("j1", 20, "SAFE", d)).toBe(0);
  expect(d.sendPush).not.toHaveBeenCalled();
});

test("maybeBatteryPush: 9 % with nothing sent yet → both crossings fire", async () => {
  const db = makeDb([
    { data: [] },
    { data: { profiles: { name: "Asha" } } }, { data: [] }, { data: [] }, { data: [] }, // thr 20
    { data: { profiles: { name: "Asha" } } }, { data: [] }, { data: [] }, { data: [] }, // thr 10
  ]);
  const d = deps(db);
  expect(await maybeBatteryPush("j1", 9, "SAFE", d)).toBe(2);
  expect(d.sendPush).toHaveBeenCalledTimes(2);
});

test("maybeBatteryPush: SAFE state → 'Monitoring is in lite mode.'", async () => {
  const db = makeDb([
    { data: [] },
    { data: { profiles: { name: "Asha Rao" } } },
    { data: [] }, { data: [] }, { data: [] },
  ]);
  const d = deps(db);
  await maybeBatteryPush("j1", 20, "SAFE", d);
  expect(d.sendPush.mock.calls[0][2]).toBe("Asha's phone is at 20%. Monitoring is in lite mode.");
});

test.each(["AMBER", "EMERGENCY", "CRITICAL"])("maybeBatteryPush: %s state → 'Monitoring continues.' (not lite mode)", async (state) => {
  const db = makeDb([
    { data: [] },
    { data: { profiles: { name: "Asha Rao" } } },
    { data: [] }, { data: [] }, { data: [] },
  ]);
  const d = deps(db);
  await maybeBatteryPush("j1", 20, state, d);
  expect(d.sendPush.mock.calls[0][2]).toBe("Asha's phone is at 20%. Monitoring continues.");
});
