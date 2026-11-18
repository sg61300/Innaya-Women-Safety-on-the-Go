// ADR-042 / R47c + R47d unit tests for the expiry + guardian-battery fan-out.
// A tiny queue-backed Supabase builder feeds results in call order; sendPush and
// logEvent are injected jest.fns so we assert copy and counts directly.
jest.mock("@/lib/alerts", () => ({ ...jest.requireActual("@/lib/alerts"), sendPush: jest.fn(), sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/cancelRetry", () => ({ cancelPhoneStopped: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/webPush", () => ({ notifyContactsWebPush: jest.fn().mockResolvedValue({ sent: [] }) }));
import { sendEmail } from "@/lib/alerts";
import { notifyContactsWebPush } from "@/lib/webPush";
import { cancelPhoneStopped } from "@/lib/cancelRetry";
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
    is: () => b,
    limit: () => b,
    order: () => b,
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
    { data: null },                                                 // no open cancel request
    { data: { expo_push_token: "OWNER" } },                         // owner profile
    { data: [{ id: "c1", email: null, linked_user_id: "u1" }] },    // contacts
    { data: [{ id: "u1", expo_push_token: "GUARD" }] },             // guardian profiles
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

// Founder: "in case phone is not working(due to any reason) send alert to all guardians".
// Fix lane R: any silent alarm, every guardian: app, else working browser, else email.
const everyone = [
  { id: "c1", email: null, linked_user_id: "u1" },       // app
  { id: "c2", email: "both@x", linked_user_id: "u2" },   // app and email: app only
  { id: "c3", email: "mail@x", linked_user_id: null },   // no app, no browser: email
  { id: "c4", email: "web@x", linked_user_id: null },    // no app, browser works: browser only
  { id: "c5", email: "dead@x", linked_user_id: "u5" },   // app account with no token: email
];
const tokens = [{ id: "u1", expo_push_token: "T1" }, { id: "u2", expo_push_token: "T2" }, { id: "u5", expo_push_token: null }];
const NOW = Date.parse("2026-11-05T10:00:00Z");
const J = { data: { owner_id: "o1", profiles: { name: "Asha Rao" } } };

describe("silent alarm fan-out", () => {
  beforeEach(() => { (sendEmail as jest.Mock).mockReset(); (sendEmail as jest.Mock).mockResolvedValue(undefined); (notifyContactsWebPush as jest.Mock).mockClear(); (notifyContactsWebPush as jest.Mock).mockResolvedValue({ sent: ["c4"] }); });

  test("R8/R9 any silent alarm with no cancel row (offline word) reaches every guardian on one channel", async () => {
    const db = makeDb([J, { data: null }, { data: { expo_push_token: "OWNER" } }, { data: everyone }, { data: tokens }]);
    const d = deps(db);
    await expireSilentAlarm("j1", 0, NOW, d);
    const guardianPush = d.sendPush.mock.calls.find((c: any[]) => c[0].includes("T1"));
    expect([...guardianPush![0]].sort()).toEqual(["T1", "T2"]);
    expect((notifyContactsWebPush as jest.Mock).mock.calls[0][1]).toEqual(["c1", "c2", "c3", "c4", "c5"]);
    expect((sendEmail as jest.Mock).mock.calls.map((c) => c[0][0]).sort()).toEqual(["dead@x", "mail@x"]);
  });

  test("R9, ChatGPT 6 sends finish first; a failed send does not stop the others, and is not marked done", async () => {
    const order: string[] = [];
    const db = makeDb([J, { data: null }, { data: { expo_push_token: "OWNER" } }, { data: everyone }, { data: tokens }]);
    const realUpdate = db.update;
    db.update = (v: any) => { order.push(`status:${v.status}`); return realUpdate(v); };
    (sendEmail as jest.Mock).mockImplementationOnce(async () => { order.push("email"); throw new Error("smtp down"); });
    (sendEmail as jest.Mock).mockImplementationOnce(async () => { order.push("email"); });
    const d = deps(db);
    expect(await expireSilentAlarm("j1", 0, NOW, d)).toBe(false);
    expect(order).toEqual(["email", "email"]);
    expect(db._updates).toHaveLength(0);
    const failed = d.logEvent.mock.calls.map((c: any[]) => c[0]).find((e: any) => e.type === "alert_failed");
    expect(failed.payload.missed).toEqual(["email:c3"]);
  });

  test("R9 a contacts read error leaves the alarm in monitoring so the next tick tries again", async () => {
    const db = makeDb([J, { data: null }, { data: { expo_push_token: "OWNER" } }, { data: null, error: { message: "boom" } } as any]);
    await expect(expireSilentAlarm("j1", 0, NOW, deps(db))).rejects.toThrow(/boom/);
    expect(db._updates).toHaveLength(0);
  });

  test("D3-3 while a cancel waits: the cancel path only. No owner push, no phone-silent alert, status stays", async () => {
    (cancelPhoneStopped as jest.Mock).mockClear();
    const db = makeDb([J, { data: { id: "r1" } }]);
    const d = deps(db);
    expect(await expireSilentAlarm("j1", 0, NOW, d)).toBe(false);
    expect(cancelPhoneStopped).toHaveBeenCalledWith("j1", NOW);
    expect(d.sendPush).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(notifyContactsWebPush).not.toHaveBeenCalled();
    expect(db._updates).toHaveLength(0);
    expect(d.logEvent).not.toHaveBeenCalled();
  });

  test("D3-4 no correct word: every guardian told, no cancel request", async () => {
    (cancelPhoneStopped as jest.Mock).mockClear();
    const db = makeDb([J, { data: null }, { data: { expo_push_token: "OWNER" } }, { data: everyone }, { data: tokens }]);
    await expireSilentAlarm("j1", 0, NOW, deps(db));
    expect(cancelPhoneStopped).not.toHaveBeenCalled();
    expect((notifyContactsWebPush as jest.Mock).mock.calls[0][1]).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });

  test("R10 no cancel waiting: the owner is told and guardians hear archived, as today", async () => {
    const db = makeDb([J, { data: null }, { data: { expo_push_token: "OWNER" } }, { data: everyone }, { data: tokens }]);
    const d = deps(db);
    await expireSilentAlarm("j1", 0, NOW, d);
    const owner = d.sendPush.mock.calls.find((c: any[]) => c[0].includes("OWNER"));
    expect(owner![1]).toBe("Your alarm expired");
    const guard = d.sendPush.mock.calls.find((c: any[]) => c[0].includes("T1"));
    expect(guard![2]).toMatch(/archived/i);
  });

  test("R13 the name is escaped in the email", async () => {
    const db = makeDb([{ data: { owner_id: "o1", profiles: { name: "<img src=x> Rao" } } }, { data: null }, { data: null }, { data: [everyone[2]] }, { data: [] }]);
    await expireSilentAlarm("j1", 0, NOW, deps(db));
    const html = (sendEmail as jest.Mock).mock.calls[0][2];
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });
});

describe("D4 silent alerts", () => {
  beforeEach(() => { (sendEmail as jest.Mock).mockReset(); (sendEmail as jest.Mock).mockResolvedValue(undefined); (notifyContactsWebPush as jest.Mock).mockClear(); (notifyContactsWebPush as jest.Mock).mockResolvedValue({ sent: ["c4"], failed: [] }); });
  const told = (reached: string[], minsAgo: number) => ({ data: [{ payload: { reached, owner: true }, ts: new Date(NOW - minsAgo * 60_000).toISOString() }] });
  const base = (req: unknown = null) => [J, { data: req }, { data: { expo_push_token: "OWNER" } }, { data: everyone }, { data: tokens }];

  test("ChatGPT 6 the retry goes to the missed guardian alone, then the status flips", async () => {
    const db = makeDb([...base(), told(["c1", "c2", "c4", "c5"], 3)]);
    const d = deps(db);
    expect(await expireSilentAlarm("j1", 0, NOW, d)).toBe(true);
    expect((sendEmail as jest.Mock).mock.calls.map((c) => c[0][0])).toEqual(["mail@x"]);
    expect(d.sendPush).toHaveBeenCalledTimes(1); // the app send, to nobody: no owner push again
    expect(d.sendPush.mock.calls[0][0]).toEqual([]);
    expect(db._updates).toContainEqual({ status: "expired" });
  });

  test("ChatGPT 6 no retry sooner than 2 min", async () => {
    const db = makeDb([...base(), told(["c1"], 1)]);
    const d = deps(db);
    expect(await expireSilentAlarm("j1", 0, NOW, d)).toBe(false);
    expect(d.sendPush).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("ChatGPT 6 a failing browser with no other channel is retried too", async () => {
    (notifyContactsWebPush as jest.Mock).mockResolvedValue({ sent: [], failed: ["w1"] });
    const db = makeDb([J, { data: null }, { data: { expo_push_token: "OWNER" } }, { data: [{ id: "w1", email: null, linked_user_id: null }] }]);
    expect(await expireSilentAlarm("j1", 0, NOW, deps(db))).toBe(false);
    expect(db._updates).toHaveLength(0);
  });

  test.each(["distress", "keep", "reraise"])("Q120 closed request (%s): guardians told, alarm stays on, no owner expiry push, no status change", async (verdict) => {
    const db = makeDb(base({ id: "r1", resolved_at: "2026-11-05T09:00:00Z", verdict }));
    const d = deps(db);
    expect(await expireSilentAlarm("j1", 0, NOW, d)).toBe(false);
    expect(db._updates).toHaveLength(0);
    expect(d.sendPush.mock.calls.flatMap((c: any[]) => c[0])).not.toContain("OWNER");
    expect(d.sendPush.mock.calls[0][2]).toMatch(/The alarm stays on/);
    expect(d.sendPush.mock.calls[0][2]).not.toMatch(/archived/);
  });

  // F8 (founder "Tell every time"): a send from before her last signal is a past silence. When the
  // phone goes quiet AGAIN (a newer signal sits between), the guardians are told again, not once ever.
  test("T24 the phone goes silent a second time in the same journey: the guardians are told again", async () => {
    // Told at a silence 30 min ago; then her phone sent a signal 5 min ago; now it is silent again.
    const db = makeDb([...base({ id: "r1", resolved_at: "2026-11-05T09:00:00Z", verdict: "distress" }), told(["c1", "c2", "c3", "c4", "c5"], 30)]);
    const d = deps(db);
    expect(await expireSilentAlarm("j1", NOW - 5 * 60_000, NOW, d)).toBe(false); // stays on, no status change
    const guard = d.sendPush.mock.calls.find((c: any[]) => c[0].includes("T1"));
    expect(guard).toBeTruthy(); // the app guardians are pushed again for the new silence
    expect([...guard![0]].sort()).toEqual(["T1", "T2"]);
    expect(d.sendPush.mock.calls[0][2]).toMatch(/The alarm stays on/);
  });

  test("Q120 told once: nothing more on later ticks", async () => {
    const db = makeDb([...base({ id: "r1", resolved_at: "2026-11-05T09:00:00Z", verdict: "distress" }), told(["c1", "c2", "c3", "c4", "c5"], 10)]);
    const d = deps(db);
    expect(await expireSilentAlarm("j1", 0, NOW, d)).toBe(false);
    expect(d.sendPush).not.toHaveBeenCalled();
    expect(notifyContactsWebPush).not.toHaveBeenCalled();
  });

  test("a request closed by a Safe, later silent: today's expiry", async () => {
    const db = makeDb(base({ id: "r1", resolved_at: "2026-11-05T09:00:00Z", verdict: "cancel" }));
    expect(await expireSilentAlarm("j1", 0, NOW, deps(db))).toBe(true);
    expect(db._updates).toContainEqual({ status: "expired" });
  });
});
