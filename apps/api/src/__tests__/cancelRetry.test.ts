// Fix AD round 2, G3-G7: the server retry clock on the deadman tick (founder Q95, Q98,
// Q100, Q101). A small in-memory db applies the real eq/is/in filters, so a row the
// tick has rolled really stops being picked.
process.env.GUARDIAN_LINK_SECRET = "test-secret";
process.env.APP_BASE_URL = "http://app";

jest.mock("@/lib/auth", () => ({ requireUser: jest.fn().mockResolvedValue({ id: "owner1" }) }));
jest.mock("@/lib/alerts", () => ({ ...jest.requireActual("@/lib/alerts"), sendPush: jest.fn().mockResolvedValue(undefined), sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/webPush", () => ({ notifyContactsWebPush: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/events", () => ({ logEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/journeyState", () => ({ applyEvent: jest.fn() }));

let tables: Record<string, any[]> = {};
let nextId = 0;
let failCycleInsert = false;
let failRead: string | null = null; // reads of this table return a database error
let hooks: Record<string, (() => void) | undefined> = {}; // run once at a named point, to land a decision mid-tick
const fire = (k: string) => { const h = hooks[k]; hooks[k] = undefined; h?.(); };
const T0 = Date.UTC(2026, 10, 5, 10, 0, 0);
let clock = T0;
const query = (t: string) => {
  const filters: ((r: any) => boolean)[] = [];
  let sort: { k: string; asc: boolean } | null = null;
  let patch: any = null;
  let cap = Infinity;
  const rows = () => {
    let out = (tables[t] ?? []).filter((r) => filters.every((f) => f(r)));
    if (sort) { const { k, asc } = sort; out = [...out].sort((a, b) => (a[k] < b[k] ? -1 : 1) * (asc ? 1 : -1)); }
    if (patch) out.forEach((r) => Object.assign(r, patch));
    return out.slice(0, cap);
  };
  const b: any = {
    select: () => b,
    eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return b; },
    is: (k: string, v: any) => { filters.push((r) => (r[k] ?? null) === v); return b; },
    in: (k: string, v: any[]) => { filters.push((r) => v.includes(r[k])); return b; },
    order: (k: string, o?: { ascending?: boolean }) => { sort = { k, asc: o?.ascending !== false }; return b; },
    limit: (n: number) => { cap = n; return b; },
    lte: (k: string, v: any) => { filters.push((r) => r[k] != null && r[k] <= v); return b; },
    gt: (k: string, v: any) => { filters.push((r) => r[k] != null && r[k] > v); return b; },
    gte: (k: string, v: any) => { filters.push((r) => r[k] != null && r[k] >= v); return b; },
    neq: (k: string) => { filters.push((r) => (r[k] ?? []).length > 0); return b; }, // only ever an array against {}
    not: (k: string) => { filters.push((r) => r[k] != null); return b; }, // only ever "is null"
    single: async () => { fire(`read:${t}`); return failRead === t && !patch ? { data: null, error: { message: "boom" } } : { data: rows()[0] ?? null }; },
    maybeSingle: async () => { fire(`read:${t}`); return failRead === t && !patch ? { data: null, error: { message: "boom" } } : { data: rows()[0] ?? null }; },
    then: (res: any) => res(failRead === t && !patch ? { data: null, error: { message: "boom" } } : { data: rows(), error: null }),
    update: (v: any) => { patch = v; return b; },
    upsert: (v: any) => { (tables[t] ??= []).push({ created_at: new Date(clock).toISOString(), ...v }); return b; },
    insert: (v: any) => {
      if (failCycleInsert && t === "cancel_requests") return { select: () => ({ single: async () => ({ data: null }) }) };
      if (t === "cancel_requests") fire("beforeInsert");
      const row = { id: `new${++nextId}`, created_at: new Date(clock).toISOString(), resolved_at: null, ...v };
      (tables[t] ??= []).push(row);
      if (t === "cancel_requests") fire("afterInsert");
      return { select: () => ({ single: async () => ({ data: row }) }), then: (res: any) => res({ data: [row], error: null }) };
    },
  };
  return b;
};
jest.mock("@/lib/supabaseAdmin", () => ({ admin: () => ({ from: (t: string) => query(t) }) }));

import { cancelRetryTick, cancelGroups, cancelPhoneStopped } from "@/lib/cancelRetry";
import { POST as VOTE } from "@/app/api/cancel-request/[id]/vote/route";
import { POST as OPEN } from "@/app/api/cancel-request/route";
import { sendPush, sendEmail } from "@/lib/alerts";
import { signCancelVoteToken, verifyCancelVoteToken } from "@/lib/token";

const MIN = 60_000;
const person = (n: number) => ({ id: `c${n}`, owner_id: "owner1", email: n % 2 ? `c${n}@x` : null, linked_user_id: n % 2 ? null : `u${n}`, tier: "primary", position: n });

function seed(contactCount: number) {
  clock = T0;
  const contacts = Array.from({ length: contactCount }, (_, i) => person(i + 1));
  tables = {
    contacts,
    profiles: contacts.filter((c) => c.linked_user_id).map((c) => ({ id: c.linked_user_id, expo_push_token: `tok-${c.id}` })),
    journeys: [{ id: "j1", owner_id: "owner1", from_label: "A", to_label: "B", status: "monitoring" }],
    journey_state: [{ journey_id: "j1", state: "CRITICAL", changed_at: "2026-11-05T09:00:00Z" }],
    cancel_requests: [{
      id: "r1", journey_id: "j1", owner_id: "owner1", method: "word", media_path: null, group_index: 0,
      asked_contact_ids: contacts.slice(0, 3).map((c) => c.id), created_at: new Date(T0).toISOString(), resolved_at: null,
    }],
    cancel_votes: [], alerts: [],
  };
}
const tickAt = async (min: number) => { clock = T0 + min * MIN; await cancelRetryTick(clock); };
const open = () => tables.cancel_requests.filter((r) => !r.rolled_at && !r.resolved_at);
const vote = (id: string, contact: string, safe: boolean) =>
  VOTE(new Request(`http://x/v?t=${encodeURIComponent(signCancelVoteToken(id, contact))}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ safe }) }), { params: Promise.resolve({ id }) });
const pushed = () => (sendPush as jest.Mock).mock.calls.flatMap((c) => c[0] as string[]);
const emailed = () => (sendEmail as jest.Mock).mock.calls.flatMap((c) => c[0] as string[]);
const clearSends = () => { (sendPush as jest.Mock).mockClear(); (sendEmail as jest.Mock).mockClear(); };

// Fix lane F1: the vote cancel path moves the state through the 0036 atomic step (applyEvent with
// opts.atomicClaim). Jest has no Postgres, so this stands in for the SQL function over the same
// in-memory rows: conditional claim + sibling close + the state row. It checks a JS stand-in, not
// the real SQL step (that is proven by supabase/tests/0036_*.test.sql on a real DB). `beforeClaim`
// fires the instant before the claim so a test can close the row in flight.
const applyEventImpl = async (journeyId: string, _ev: unknown, _actor: string, _deps: unknown, opts?: { atomicClaim?: { requestId: string; claimMode: "open" | "distress"; closeSiblings: boolean } }) => {
  if (!opts?.atomicClaim) return { state: "RESOLVED_MONITORING", actions: [] };
  fire("beforeClaim");
  const reqs = (tables.cancel_requests ??= []);
  const target = reqs.find((r) => r.id === opts.atomicClaim!.requestId);
  const claimable = opts.atomicClaim.claimMode === "open"
    ? !!target && (target.resolved_at ?? null) === null
    : !!target && target.verdict === "distress";
  if (!claimable) {
    const latest = [...(tables.journey_state ?? [])].sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1))[0];
    return { state: latest?.state ?? "CRITICAL", actions: [], claimed: false, outcome: "claim_lost" };
  }
  if (opts.atomicClaim.claimMode === "open") Object.assign(target, { verdict: "cancel", resolved_at: new Date(clock).toISOString() });
  else target!.verdict = "cancel";
  if (opts.atomicClaim.closeSiblings) for (const r of reqs) if (r.journey_id === journeyId && (r.resolved_at ?? null) === null) Object.assign(r, { verdict: "cancel", resolved_at: new Date(clock).toISOString() });
  (tables.journey_state ??= []).push({ journey_id: journeyId, state: "RESOLVED_MONITORING", changed_at: new Date(clock + (++nextId)).toISOString() });
  return { state: "RESOLVED_MONITORING", actions: [], claimed: true, outcome: "applied" };
};

beforeEach(() => { jest.clearAllMocks(); nextId = 0; failRead = null; hooks = {}; (jest.requireMock("@/lib/journeyState").applyEvent as jest.Mock).mockImplementation(applyEventImpl); });

test("G3: nothing before minute 15, then exactly one resend to the same guardians, nothing else up to minute 30", async () => {
  seed(3);
  await tickAt(14.9);
  expect(sendPush).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
  await tickAt(15);
  expect(pushed()).toEqual(["tok-c2"]); // app guardian: app notification only
  expect(emailed()).toEqual(["c1@x", "c3@x"]); // no app: today's email
  clearSends();
  for (const m of [15.5, 20, 29.9]) await tickAt(m);
  expect(sendPush).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
});

test("G3: a guardian with the app and an email gets only the app notification on the resend", async () => {
  seed(2);
  tables.contacts[1].email = "both@x";
  await tickAt(15);
  expect(pushed()).toEqual(["tok-c2"]);
  expect(emailed()).toEqual(["c1@x"]);
});

test("D3-1 at minute 30 the request moves to the next group by itself; the earlier group gets no more; notified at 0 and 15", async () => {
  seed(5);
  await tickAt(30);
  const cur = open();
  expect(cur).toHaveLength(1);
  expect(cur[0].asked_contact_ids).toEqual(["c4", "c5"]);
  expect(cur[0].group_index).toBe(1);
  expect(pushed()).toEqual(["tok-c4"]);
  expect(emailed()).toEqual(["c5@x"]);
  clearSends();
  await tickAt(44);
  expect(sendPush).not.toHaveBeenCalled();
  await tickAt(45);
  expect(pushed()).toEqual(["tok-c4"]);
  expect(emailed()).toEqual(["c5@x"]);
});

test("D3-1 after the last group it wraps to the first", async () => {
  seed(5);
  await tickAt(30);
  await tickAt(60);
  expect(open()[0].group_index).toBe(0);
  expect(open()[0].asked_contact_ids).toEqual(["c1", "c2", "c3"]);
});

test("D3-1 one guardian or one group stays on them", async () => {
  for (const n of [1, 3]) {
    seed(n);
    await tickAt(30);
    expect(open()[0].asked_contact_ids).toHaveLength(n);
    expect(open()[0].group_index).toBe(0);
  }
});

test("D3-1 the question is gone from the server and the migration", () => {
  const fs = require("fs"), path = require("path");
  expect(fs.existsSync(path.join(__dirname, "../app/api/cancel-request/prompt/route.ts"))).toBe(false);
  const sql = fs.readFileSync(path.join(__dirname, "../../../../supabase/migrations/0032_cancel_group_window.sql"), "utf8");
  expect(sql).not.toMatch(/prompted_at|prompt_answer/);
});

test("G6: groups are primary tier first, then position, 3 at a time; who can be reached is decided before, a browser-only guardian stays in", () => {
  const c = (id: string, tier: string, position: number, email: string | null = "e@x") => ({ id, tier, position, email, linked_user_id: null });
  const g = cancelGroups([c("b", "buffer", 0), c("p2", "primary", 2), c("p1", "primary", 1), c("x", "primary", 3, null), c("p4", "primary", 4), c("p5", "primary", 5)]);
  expect(g.map((x) => x.map((y) => y.id))).toEqual([["p1", "p2", "x"], ["p4", "p5", "b"]]);
});

test("G7: a dropped-group guardian's Safe works inside window + 5 min and is refused after", async () => {
  seed(5);
  await tickAt(30);
  clock = T0 + 35 * MIN;
  const now = jest.spyOn(Date, "now").mockImplementation(() => clock);
  const ok = await vote("r1", "c1", true);
  expect((await ok.json()).verdict).toBe("cancel");
  expect(tables.cancel_requests.every((r) => r.resolved_at)).toBe(true); // every open cycle closes
  now.mockRestore();

  seed(5);
  await tickAt(30);
  clock = T0 + 35 * MIN + 1;
  const now2 = jest.spyOn(Date, "now").mockImplementation(() => clock);
  const late = await vote("r1", "c1", true);
  expect(late.status).toBe(410);
  expect(tables.cancel_votes).toHaveLength(0);
  now2.mockRestore();
});

test("G7: a request closed by keep or her own SOS refuses a late Safe", async () => {
  seed(3);
  Object.assign(tables.cancel_requests[0], { resolved_at: new Date(T0).toISOString(), verdict: "keep" });
  clock = T0 + MIN;
  const now = jest.spyOn(Date, "now").mockImplementation(() => clock);
  expect((await vote("r1", "c1", true)).status).toBe(410);
  now.mockRestore();
});

test("the tick closes a request whose alarm is no longer CRITICAL", async () => {
  seed(3);
  tables.journey_state[0].state = "RESOLVED_MONITORING";
  await tickAt(15);
  expect(sendPush).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
  expect(open()).toHaveLength(0);
});

test("the retry goes on for an expired journey (phone silent), and stops for a finished one", async () => {
  seed(3);
  tables.journeys[0].status = "expired";
  await tickAt(15);
  expect(pushed()).toEqual(["tok-c2"]);
  seed(3);
  tables.journeys[0].status = "done";
  clearSends();
  await tickAt(15);
  expect(sendPush).not.toHaveBeenCalled();
});

test("a failed guardian does not stop the others", async () => {
  seed(3);
  (sendEmail as jest.Mock).mockRejectedValueOnce(new Error("smtp down"));
  await tickAt(15);
  expect(pushed()).toEqual(["tok-c2"]);
  expect((sendEmail as jest.Mock).mock.calls).toHaveLength(2);
});

// Founder Q101 "why would resend be stopped unless user is safe": a failed insert at
// minute 30 must not end the asking for good.
it("a failed new cycle is retried on the next tick", async () => {
  seed(3);
  failCycleInsert = true;
  await tickAt(30);
  failCycleInsert = false;
  expect(tables.cancel_requests).toHaveLength(1);
  expect(open().map((r) => r.id)).toEqual(["r1"]);
  await tickAt(30.5);
  expect(tables.cancel_requests).toHaveLength(2);
  expect(open()).toHaveLength(1);
  expect(open()[0].id).not.toBe("r1");
});

it("the request and its resend also go out as browser notifications to the same group", async () => {
  const spy = jest.spyOn(jest.requireMock("@/lib/webPush"), "notifyContactsWebPush");
  seed(3);
  await tickAt(15);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy.mock.calls[0].slice(0, 2)).toEqual(["j1", ["c1", "c2", "c3"]]);
  spy.mockRestore();
});

// ---- Fix lane R (review fixes 2026-11-06) ----
const decide = (verdict: string) => () => { for (const r of tables.cancel_requests) if (!r.resolved_at) Object.assign(r, { verdict, resolved_at: new Date(clock).toISOString() }); };
const atClock = async <T,>(min: number, fn: () => Promise<T>) => {
  clock = T0 + min * MIN;
  const spy = jest.spyOn(Date, "now").mockImplementation(() => clock);
  try { return await fn(); } finally { spy.mockRestore(); }
};
const closedAt = () => new Date(T0).toISOString();

describe("R1 a vote on a closed row", () => {
  test.each(["keep", "reraise", "distress", null])("Not safe on a row closed as %s is refused and changes nothing", async (verdict) => {
    seed(3);
    Object.assign(tables.cancel_requests[0], { resolved_at: closedAt(), verdict });
    const res = await atClock(1, () => vote("r1", "c1", false));
    expect(res.status).toBe(410);
    expect(tables.cancel_requests[0]).toMatchObject({ resolved_at: closedAt(), verdict });
    expect(tables.cancel_votes).toHaveLength(0);
    expect(jest.requireMock("@/lib/journeyState").applyEvent).not.toHaveBeenCalled();
  });

  test("Not safe on a row closed by a Safe given on another row is refused: it does not reopen", async () => {
    seed(3);
    Object.assign(tables.cancel_requests[0], { resolved_at: closedAt(), verdict: "cancel" });
    const res = await atClock(1, () => vote("r1", "c1", false));
    expect(res.status).toBe(410);
    expect(tables.cancel_requests[0]).toMatchObject({ resolved_at: closedAt(), verdict: "cancel" });
  });

  test("a row that closes while a Not safe is on its way stays closed", async () => {
    seed(3);
    hooks["read:journeys"] = decide("keep");
    const res = await atClock(1, () => vote("r1", "c1", false));
    expect(res.status).toBe(200);
    expect(tables.cancel_requests[0].resolved_at).toBeTruthy();
    expect(tables.cancel_requests[0].verdict).toBe("keep");
  });

  test("today's overturn stays: on the row her Safe was given on, 2 Not safe still re-raise", async () => {
    seed(3);
    await atClock(1, () => vote("r1", "c1", true));
    expect(tables.cancel_requests[0].verdict).toBe("cancel");
    await atClock(2, () => vote("r1", "c2", false));
    expect(tables.cancel_requests[0].verdict).toBe("cancel");
    const res = await atClock(3, () => vote("r1", "c3", false));
    expect((await res.json()).verdict).toBe("reraise");
  });
});

describe("R3 the vote link lives as long as Safe does", () => {
  test("a real token signed at minute 0 still works at minute 34 and is dead at minute 36", async () => {
    seed(3);
    const tok = await atClock(0, async () => signCancelVoteToken("r1", "c1"));
    const send = () => VOTE(new Request(`http://x/v?t=${encodeURIComponent(tok)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ safe: true }) }), { params: Promise.resolve({ id: "r1" }) });
    expect((await atClock(36, send)).status).toBe(403);
    expect(tables.cancel_votes).toHaveLength(0);
    expect((await atClock(34, send)).status).toBe(200);
  });
});

describe("R4 a decision during the tick", () => {
  test("a Safe between the tick's read and its claim: no cycle, nothing sent", async () => {
    seed(3);
    hooks["read:journeys"] = decide("cancel");
    await tickAt(30);
    expect(tables.cancel_requests).toHaveLength(1);
    expect(sendPush).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("a Safe between the tick's read and its claim: no resend", async () => {
    seed(3);
    hooks["read:journeys"] = decide("cancel");
    await tickAt(15);
    expect(sendPush).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test.each(["beforeInsert", "afterInsert"])("a Safe at %s: nothing sent, no open row, newest row carries the verdict", async (at) => {
    seed(3);
    hooks[at] = decide("cancel");
    await tickAt(30);
    expect(sendPush).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(tables.cancel_requests.filter((r) => !r.resolved_at)).toHaveLength(0);
    expect(tables.cancel_requests[tables.cancel_requests.length - 1].verdict).toBe("cancel");
  });
});

describe("R6 a resend that fails or is cut off", () => {
  test("a failed guardian is retried after 2 min, alone; the others are not sent twice; what was missed is logged", async () => {
    seed(3);
    (sendEmail as jest.Mock).mockRejectedValueOnce(new Error("smtp down")); // c1
    await tickAt(15);
    expect(tables.cancel_requests[0].resend_pending_ids).toEqual(["c1"]);
    const logged = (jest.requireMock("@/lib/events").logEvent as jest.Mock).mock.calls.map((c) => c[0]);
    expect(logged.some((e) => e.type === "alert_failed" && e.payload.missed?.includes("c1"))).toBe(true);
    clearSends();
    for (const m of [15.5, 16, 16.9]) await tickAt(m);
    expect(sendEmail).not.toHaveBeenCalled();
    await tickAt(17);
    expect(emailed()).toEqual(["c1@x"]);
    expect(sendPush).not.toHaveBeenCalled();
    expect(tables.cancel_requests[0].resend_pending_ids).toEqual([]);
    clearSends();
    await tickAt(19);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("a push Expo refuses counts as failed", async () => {
    seed(3);
    (sendPush as jest.Mock).mockResolvedValueOnce(false);
    await tickAt(15);
    expect(tables.cancel_requests[0].resend_pending_ids).toEqual(["c2"]);
  });

  test("cut off after the claim: everyone still pending is sent once, at most every 2 min", async () => {
    seed(3);
    Object.assign(tables.cancel_requests[0], { resent_at: new Date(T0 + 15 * MIN).toISOString(), resend_pending_ids: ["c1", "c2", "c3"] });
    await tickAt(16);
    expect(sendEmail).not.toHaveBeenCalled();
    await tickAt(17);
    expect(pushed()).toEqual(["tok-c2"]);
    expect(emailed()).toEqual(["c1@x", "c3@x"]);
  });

  test("two ticks racing the retry send once", async () => {
    seed(3);
    Object.assign(tables.cancel_requests[0], { resent_at: new Date(T0 + 15 * MIN).toISOString(), resend_pending_ids: ["c1"] });
    clock = T0 + 17 * MIN;
    await Promise.all([cancelRetryTick(clock), cancelRetryTick(clock)]);
    expect(emailed()).toEqual(["c1@x"]);
  });

  test("still missed when the window ends: logged, and the new cycle asks them", async () => {
    seed(3);
    Object.assign(tables.cancel_requests[0], { resent_at: new Date(T0 + 29 * MIN).toISOString(), resend_pending_ids: ["c1"] });
    await tickAt(30);
    const logged = (jest.requireMock("@/lib/events").logEvent as jest.Mock).mock.calls.map((c) => c[0]);
    expect(logged.some((e) => e.type === "cancel_request_resend_missed" && e.payload.missed.includes("c1"))).toBe(true);
    expect(emailed()).toContain("c1@x");
  });

  test("cut off between the claim and the new cycle: the next tick after 2 min opens it", async () => {
    seed(3);
    tables.cancel_requests[0].rolled_at = new Date(T0 + 30 * MIN).toISOString();
    await tickAt(31);
    expect(tables.cancel_requests).toHaveLength(1);
    await tickAt(32);
    expect(open()).toHaveLength(1);
    expect(open()[0].id).not.toBe("r1");
    expect(pushed()).toEqual(["tok-c2"]);
  });

  test("an old rolled row with a live successor is left alone", async () => {
    seed(3);
    await tickAt(30);
    clearSends();
    await tickAt(33);
    expect(tables.cancel_requests).toHaveLength(2);
    expect(sendPush).not.toHaveBeenCalled();
  });
});

describe("R7 a database error in the tick", () => {
  test("the read of the requests fails: the tick rejects instead of reporting success", async () => {
    seed(3);
    failRead = "cancel_requests";
    await expect(cancelRetryTick(T0 + 15 * MIN)).rejects.toThrow(/boom/);
  });

  test.each(["journey_state", "journeys"])("a failed read of %s does not close the request", async (t) => {
    seed(3);
    failRead = t;
    await tickAt(15);
    expect(tables.cancel_requests[0].resolved_at).toBeNull();
    expect(tables.cancel_requests[0].resent_at ?? null).toBeNull();
  });

  test("a failed read of the contacts does not spend the cycle on nobody", async () => {
    seed(3);
    failRead = "contacts";
    await tickAt(30);
    expect(tables.cancel_requests).toHaveLength(1);
    expect(tables.cancel_requests[0].rolled_at ?? null).toBeNull();
  });
});

test("R12 resend channel: app gets app, no-app with a working browser gets browser only, neither gets email", async () => {
  const web = jest.requireMock("@/lib/webPush").notifyContactsWebPush as jest.Mock;
  seed(3); // c1 email, c2 app, c3 email
  web.mockResolvedValueOnce({ sent: ["c1"] }); // c1 browser works; c3 has none or a dead one
  await tickAt(15);
  expect(pushed()).toEqual(["tok-c2"]);
  expect(emailed()).toEqual(["c3@x"]);
  expect(tables.cancel_requests[0].resend_pending_ids).toEqual([]);
});

test("R12 a guardian with no channel at all is logged as missed, nothing is thrown", async () => {
  seed(3);
  Object.assign(tables.contacts[0], { email: null, linked_user_id: "uX" }); // app account with no token
  await tickAt(15);
  expect(tables.cancel_requests[0].resend_pending_ids).toEqual(["c1"]);
});

test("R14 an open row from before 0032 on a held alarm: the clock drives it, and a Safe can finish it", async () => {
  seed(3);
  tables.journey_state[0].state = "CANCEL_HOLD";
  await tickAt(40);
  expect(open()).toHaveLength(1);
  expect(open()[0].id).not.toBe("r1");
  const res = await atClock(41, () => vote(open()[0].id, "c1", true));
  expect((await res.json()).verdict).toBe("cancel");
  expect(tables.cancel_requests.filter((r) => !r.resolved_at)).toHaveLength(0);
});

test("R14 the tick closes every open row of a journey whose alarm is over", async () => {
  seed(3);
  await tickAt(30);
  tables.journey_state[0].state = "RESOLVED_MONITORING";
  await tickAt(45);
  expect(tables.cancel_requests.filter((r) => !r.resolved_at)).toHaveLength(0);
});

test("R14 migration 0032 no longer rolls open rows and carries the resend column", () => {
  const sql = require("fs").readFileSync(require("path").join(__dirname, "../../../../supabase/migrations/0032_cancel_group_window.sql"), "utf8");
  expect(sql).not.toMatch(/set\s+rolled_at/i);
  expect(sql).toMatch(/resend_pending_ids\s+uuid\[\]/i);
  expect(sql).toMatch(/interval '24 hours'/);
});

// ChatGPT 12: the earlier tests called the tick in sequence, which proves no race.
test("two ticks at once at minute 15 send one resend; at minute 30 open one cycle", async () => {
  seed(3);
  clock = T0 + 15 * MIN;
  await Promise.all([cancelRetryTick(clock), cancelRetryTick(clock)]);
  expect(pushed()).toEqual(["tok-c2"]);
  seed(3);
  clock = T0 + 30 * MIN;
  await Promise.all([cancelRetryTick(clock), cancelRetryTick(clock)]);
  expect(tables.cancel_requests).toHaveLength(2);
});

// ---- Fix lane D3 (founder Q111-Q119) ----
const logged = () => (jest.requireMock("@/lib/events").logEvent as jest.Mock).mock.calls.map((c) => c[0]);

describe("D3-3 correct word, then the phone stops working", () => {
  const stopped = async (min: number) => { clock = T0 + min * MIN; await cancelPhoneStopped("j1", clock); };
  const row = () => tables.cancel_requests[tables.cancel_requests.length - 1];
  const heartbeatAt = (min: number) => { tables.heartbeats = [{ journey_id: "j1", ts: new Date(T0 + min * MIN).toISOString() }]; };

  test("first group is told even while another group is being asked; 15 min on, all guardians; once each; clock paused", async () => {
    seed(7);
    await tickAt(30); // group 2 is being asked
    expect(open()[0].group_index).toBe(1);
    clearSends();
    await stopped(35);
    expect(row()).toMatchObject({ phone_stage: "first", group_index: 0, asked_contact_ids: ["c1", "c2", "c3"] });
    expect(pushed()).toEqual(["tok-c2"]);
    expect(emailed()).toEqual(["c1@x", "c3@x"]);
    clearSends();
    await stopped(35.5); // every later tick that sees the silence
    await tickAt(49.9);
    expect(sendPush).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    await tickAt(50);
    expect(row().phone_stage).toBe("all");
    expect(row().asked_contact_ids).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "c7"]);
    expect(pushed().sort()).toEqual(["tok-c2", "tok-c4", "tok-c6"]);
    expect(emailed().sort()).toEqual(["c1@x", "c3@x", "c5@x", "c7@x"]);
    clearSends();
    const rows = tables.cancel_requests.length;
    for (const m of [50.5, 65, 80, 95, 200]) await tickAt(m);
    await stopped(201);
    expect(sendPush).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(tables.cancel_requests).toHaveLength(rows);
  });

  test("a Safe from the all-guardians request ends it, 35 min after they were asked and no later", async () => {
    seed(5);
    await stopped(15);
    await tickAt(30);
    const id = row().id;
    expect((await atClock(66, () => vote(id, "c5", true))).status).toBe(410);
    const res = await atClock(64, () => vote(id, "c5", true));
    expect((await res.json()).verdict).toBe("cancel");
    expect(tables.cancel_requests.filter((r) => !r.resolved_at)).toHaveLength(0);
  });

  test("phone back during the first-group wait: the normal process resumes on that row", async () => {
    seed(5);
    await stopped(15);
    const id = row().id;
    heartbeatAt(20);
    await tickAt(21);
    expect(row()).toMatchObject({ id, phone_stage: null });
    clearSends();
    await tickAt(30); // 15 min into the row: its resend
    expect(pushed()).toEqual(["tok-c2"]);
    clearSends();
    await tickAt(45); // 30 min: the next group
    expect(open()[0].asked_contact_ids).toEqual(["c4", "c5"]);
  });

  test("phone back after all guardians were asked: moves on to the next group at once, normal from there", async () => {
    seed(5);
    await stopped(15);
    await tickAt(30);
    heartbeatAt(40);
    clearSends();
    await tickAt(41);
    expect(open()[0]).toMatchObject({ phone_stage: null, asked_contact_ids: ["c4", "c5"], group_index: 1 });
  });

  test("a frame also counts as the phone being back; a signal from before the outage does not", async () => {
    seed(3);
    heartbeatAt(10);
    await stopped(15);
    await tickAt(16);
    expect(row().phone_stage).toBe("first");
    tables.events = [{ journey_id: "j1", type: "frame", ts: new Date(T0 + 20 * MIN).toISOString() }];
    await tickAt(21);
    expect(row().phone_stage).toBeNull();
  });

  test("it can happen again after the phone came back", async () => {
    seed(3);
    await stopped(15);
    heartbeatAt(20);
    await tickAt(21);
    const before = tables.cancel_requests.length;
    await stopped(36);
    expect(tables.cancel_requests).toHaveLength(before + 1);
    expect(row().phone_stage).toBe("first");
  });

  test("two ticks at once start it once", async () => {
    seed(3);
    clock = T0 + 15 * MIN;
    await Promise.all([cancelPhoneStopped("j1", clock), cancelPhoneStopped("j1", clock)]);
    expect(tables.cancel_requests).toHaveLength(2);
  });

  test("the row closes: nothing more", async () => {
    seed(3);
    await stopped(15);
    decide("cancel")();
    clearSends();
    await tickAt(30);
    await stopped(31);
    expect(sendPush).not.toHaveBeenCalled();
  });
});

describe("D3-2 can a guardian really be asked", () => {
  const openReq = () => OPEN(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ journeyId: "j1", method: "word" }) }));
  const noOpen = () => { tables.cancel_requests = []; };

  test("a linked guardian with no token, browser or email does not count; nobody asked, row still opens, alarm stays", async () => {
    seed(0);
    noOpen();
    tables.contacts = [{ id: "c1", owner_id: "owner1", email: null, linked_user_id: "u1", tier: "primary", position: 0 }];
    tables.profiles = [{ id: "u1", expo_push_token: null }];
    const res = await openReq();
    expect((await res.json()).asked).toEqual([]);
    expect(tables.cancel_requests).toHaveLength(1);
    expect(sendPush).not.toHaveBeenCalled();
    expect(jest.requireMock("@/lib/journeyState").applyEvent).toHaveBeenCalledWith("j1", { type: "CANCEL_REQUESTED", method: "word" }, "user");
  });

  test.each([
    ["a push token", { profiles: [{ id: "u1", expo_push_token: "tok" }] }],
    ["a browser subscription", { profiles: [{ id: "u1", expo_push_token: null }], web_push_subscriptions: [{ contact_id: "c1" }] }],
  ])("a linked guardian with %s counts", async (_n, extra) => {
    seed(0);
    noOpen();
    tables.contacts = [{ id: "c1", owner_id: "owner1", email: null, linked_user_id: "u1", tier: "primary", position: 0 }];
    Object.assign(tables, extra);
    expect((await (await openReq()).json()).asked).toEqual(["c1"]);
  });

  test("an unreachable guardian is skipped when the clock forms the next group too", async () => {
    seed(4);
    tables.profiles = tables.profiles.filter((p: any) => p.id !== "u4"); // c4 has an app account, no token
    await tickAt(30);
    expect(open()[0].asked_contact_ids).toEqual(["c1", "c2", "c3"]);
  });
});

test("D3-4 no correct word: the clock never opens a cancel request by itself", async () => {
  seed(3);
  tables.cancel_requests = [];
  await tickAt(60);
  expect(tables.cancel_requests).toHaveLength(0);
  expect(sendPush).not.toHaveBeenCalled();
  expect(logged().some((e) => e.type === "cancel_request_cycle")).toBe(false);
});

describe("D3-7 the overturn stays", () => {
  test("2 Not safe after a Safe, on the row holding the Safe, re-raises through SOS", async () => {
    seed(3);
    tables.journeys[0].alarm_mode = "silent";
    await atClock(1, () => vote("r1", "c1", true));
    await atClock(2, () => vote("r1", "c2", false));
    const res = await atClock(3, () => vote("r1", "c3", false));
    expect((await res.json()).verdict).toBe("reraise");
    expect(jest.requireMock("@/lib/journeyState").applyEvent).toHaveBeenLastCalledWith("j1", { type: "SOS", mode: "silent" }, "trustee");
  });
  test("a row closed by a Safe on another row takes no Not safe", async () => {
    seed(3);
    Object.assign(tables.cancel_requests[0], { resolved_at: closedAt(), verdict: "cancel" });
    tables.cancel_votes = [{ request_id: "other", contact_id: "c9", safe: true }];
    expect((await atClock(1, () => vote("r1", "c1", false))).status).toBe(410);
  });
});

test("D3-5 Safe is refused on a request closed by the emergency word", async () => {
  seed(3);
  Object.assign(tables.cancel_requests[0], { resolved_at: closedAt(), verdict: "distress" });
  expect((await atClock(1, () => vote("r1", "c1", true))).status).toBe(410);
  expect(tables.cancel_requests[0].verdict).toBe("distress");
});

describe("D4 second review", () => {
  const web = () => jest.requireMock("@/lib/webPush").notifyContactsWebPush as jest.Mock;
  const sql = () => require("fs").readFileSync(require("path").join(__dirname, "../../../../supabase/migrations/0032_cancel_group_window.sql"), "utf8") as string;

  test("M8 the browser notification carries that guardian's own vote link, so a dropped guardian can use the late Safe", async () => {
    seed(3);
    await tickAt(15);
    const query = web().mock.calls[0][4] as (id: string) => string;
    const link = new URLSearchParams(query("c1"));
    expect(link.get("cr")).toBe("r1");
    expect(verifyCancelVoteToken(link.get("vt") as string)).toMatchObject({ requestId: "r1", contactId: "c1" });
  });

  test("M9 expired journey, open request, phone silent 15 min: first group told, as on a monitoring journey", async () => {
    seed(3);
    tables.journeys[0].status = "expired";
    tables.heartbeats = [{ journey_id: "j1", ts: new Date(T0 - 5 * MIN).toISOString() }];
    await tickAt(15);
    expect(open()).toHaveLength(1);
    expect(open()[0]).toMatchObject({ phone_stage: "first", group_index: 0 });
  });

  test("M9 expired journey, phone still sending: nothing changes", async () => {
    seed(3);
    tables.journeys[0].status = "expired";
    tables.heartbeats = [{ journey_id: "j1", ts: new Date(T0 + 14 * MIN).toISOString() }];
    await tickAt(16);
    expect(open()[0]).toMatchObject({ id: "r1" });
    expect(open()[0].phone_stage ?? null).toBeNull();
  });

  test("M9 0032 step 3 takes over only rows on monitoring journeys; others close, with no contact", () => {
    expect(sql()).toMatch(/j\.status <> 'monitoring' or r\.created_at/);
    expect(sql()).not.toMatch(/j\.status = 'done'/);
  });

  test("M10 the browser subscription read failing does not stop the correct word", async () => {
    seed(3);
    tables.cancel_requests = [];
    failRead = "web_push_subscriptions";
    const res = await OPEN(new Request("http://x", { method: "POST", body: JSON.stringify({ journeyId: "j1", method: "word" }) }));
    expect(res.status).toBe(200);
    expect((await res.json()).asked).toEqual(["c1", "c2", "c3"]);
  });

  test("M10 nor the clock", async () => {
    seed(6);
    failRead = "web_push_subscriptions";
    await tickAt(30);
    expect(open()[0].asked_contact_ids).toEqual(["c4", "c5", "c6"]);
  });

  test("H2 the phone's true mode reaches the journey with the word; an unknown value does not", async () => {
    seed(3);
    tables.cancel_requests = [];
    tables.journeys[0].alarm_mode = "siren";
    await OPEN(new Request("http://x", { method: "POST", body: JSON.stringify({ journeyId: "j1", method: "word", alarmMode: "silent" }) }));
    expect(tables.journeys[0].alarm_mode).toBe("silent");
    await OPEN(new Request("http://x", { method: "POST", body: JSON.stringify({ journeyId: "j1", method: "word", alarmMode: "loud" }) }));
    expect(tables.journeys[0].alarm_mode).toBe("silent");
  });

  describe("a vote never overwrites or follows a closed row (ChatGPT 1)", () => {
    const { applyEvent } = jest.requireMock("@/lib/journeyState") as { applyEvent: jest.Mock };
    let dateNow: jest.SpyInstance;
    beforeEach(() => { dateNow = jest.spyOn(Date, "now").mockImplementation(() => clock); });
    afterEach(() => dateNow.mockRestore());
    test.each(["distress", "keep"])("Safe in flight when %s closes the row: refused, row and state untouched", async (closedBy) => {
      seed(3);
      tables.journeys[0].alarm_mode = "siren";
      // the row closes in the same instant the atomic step tries to claim it
      hooks["beforeClaim"] = () => Object.assign(tables.cancel_requests[0], { verdict: closedBy, resolved_at: new Date(clock).toISOString() });
      const res = await vote("r1", "c1", true);
      expect(res.status).toBe(410);
      expect(tables.cancel_requests[0].verdict).toBe(closedBy);
    });

    test("a failed step changes nothing (no claim to give back); a retry ends it", async () => {
      seed(3);
      applyEvent.mockRejectedValueOnce(new Error("db down"));
      expect((await vote("r1", "c1", true)).status).toBe(500);
      expect(tables.cancel_requests[0].resolved_at).toBeNull(); // the atomic step wrote nothing
      expect(tables.cancel_requests[0].verdict ?? null).toBeNull();
      expect((await vote("r1", "c1", true)).status).toBe(200);
      expect(tables.cancel_requests[0].verdict).toBe("cancel");
    });

    test("2 Not safe on an old Safe row cannot wake a later alarm's closed request", async () => {
      seed(3);
      Object.assign(tables.cancel_requests[0], { verdict: "cancel", resolved_at: new Date(T0).toISOString() });
      tables.cancel_votes = [{ request_id: "r1", contact_id: "c1", safe: true, created_at: new Date(T0).toISOString() }];
      tables.cancel_requests.push({ id: "r2", journey_id: "j1", owner_id: "owner1", asked_contact_ids: ["c1"], created_at: new Date(T0 + 60 * MIN).toISOString(), verdict: "distress", resolved_at: new Date(T0 + 61 * MIN).toISOString() });
      expect((await vote("r1", "c2", false)).status).toBe(410);
      expect(applyEvent).not.toHaveBeenCalled();
    });

    test("M6 an overturn on a dropped group's row shows on the newest row, the one her phone reads", async () => {
      seed(3);
      tables.cancel_votes = [{ request_id: "r1", contact_id: "c1", safe: true, created_at: new Date(T0).toISOString() }, { request_id: "r1", contact_id: "c2", safe: false, created_at: new Date(T0 + MIN).toISOString() }];
      Object.assign(tables.cancel_requests[0], { verdict: "cancel", resolved_at: new Date(T0).toISOString() });
      tables.cancel_requests.push({ id: "r2", journey_id: "j1", owner_id: "owner1", asked_contact_ids: ["c4"], created_at: new Date(T0 + 30 * MIN).toISOString(), verdict: "cancel", resolved_at: new Date(T0).toISOString() });
      expect((await vote("r1", "c3", false)).status).toBe(200);
      expect(tables.cancel_requests.map((r) => r.verdict)).toEqual(["reraise", "reraise"]);
    });
  });

  describe("the first ask of a cycle is retried (ChatGPT 3)", () => {
    test("a guardian it missed is asked again after 2 min, alone, then not again", async () => {
      seed(6);
      await tickAt(30);
      const row = () => open()[0];
      expect(row().ask_pending_ids).toEqual([]);
      row().ask_pending_ids = ["c5"]; // the send to c5 failed
      clearSends();
      await tickAt(31);
      expect(emailed()).toEqual([]);
      await tickAt(32);
      expect(emailed()).toEqual(["c5@x"]);
      expect(row().ask_pending_ids).toEqual([]);
      clearSends();
      await tickAt(35);
      expect(emailed()).toEqual([]);
    });

    test("a run cut off mid-send: everyone still owed is asked; a real failed send stays owed", async () => {
      seed(6);
      (sendEmail as jest.Mock).mockRejectedValueOnce(new Error("smtp down"));
      await tickAt(30); // c5 is the first email of group 2
      expect(open()[0].ask_pending_ids).toEqual(["c5"]);
    });

    test("includes the phone-stopped stages", async () => {
      seed(3);
      tables.heartbeats = [];
      await cancelPhoneStopped("j1", T0);
      const row = open()[0];
      expect(row.phone_stage).toBe("first");
      row.ask_pending_ids = ["c1"];
      clearSends();
      await tickAt(2);
      expect(emailed()).toEqual(["c1@x"]);
      expect(row.ask_pending_ids).toEqual([]);
      expect(open()[0].id).toBe(row.id); // still the same paused stage
    });
  });

  describe("the clock reads only rows with work (ChatGPT 7)", () => {
    test("an older active alarm is reached behind 600 dropped rows", async () => {
      seed(6);
      for (let i = 0; i < 600; i++) tables.cancel_requests.push({ id: `old${i}`, journey_id: `other${i}`, owner_id: "x", asked_contact_ids: [], created_at: new Date(T0 + 5 * MIN).toISOString(), resolved_at: null, rolled_at: new Date(T0).toISOString(), next_opened_at: new Date(T0).toISOString() });
      await tickAt(30);
      expect(tables.cancel_requests.find((r) => r.id === "r1").rolled_at).toBeTruthy();
      expect(tables.cancel_requests.some((r) => r.asked_contact_ids?.includes("c4"))).toBe(true);
    });

    test("a row not yet due causes no journey read at all", async () => {
      seed(3);
      failRead = "journey_state";
      const spy = jest.spyOn(console, "error").mockImplementation(() => {});
      await tickAt(5);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
