// Fix lane D5 (founder Q125): a guardian who has spoken to her ends an emergency-word alarm.
// Runs the real route, the real applyEvent and protocol, the real guardian page and the real
// deadman tick over one small in-memory database, so a claim, a state move and a give-back
// are checked on the rows themselves. Channels (app push, browser, email) are fakes.
import React from "react";

process.env.GUARDIAN_LINK_SECRET = "test-secret";
process.env.APP_BASE_URL = "http://app";

const { renderToStaticMarkup }: { renderToStaticMarkup: (el: React.ReactElement) => string } = require("react-dom/server");

jest.mock("@/app/g/[token]/GuardianStatus", () => ({
  GuardianStatus: () => React.createElement("div", { id: "status" }),
  LinkExpired: () => React.createElement("div", { id: "expired" }, "Link expired"),
}));
jest.mock("@/lib/auth", () => ({ isCron: () => true, requireUser: jest.fn() }));
jest.mock("@/lib/alerts", () => ({
  escapeHtml: jest.requireActual("@/lib/alerts").escapeHtml,
  sendPush: jest.fn().mockResolvedValue(true),
  sendEmail: jest.fn().mockResolvedValue(undefined),
  notifyGuardians: jest.fn().mockResolvedValue(undefined),
  notifyNearby: jest.fn().mockResolvedValue([]),
}));
const mockWebSent = new Set<string>();
jest.mock("@/lib/webPush", () => ({
  notifyContactsWebPush: jest.fn(async (_j: string, ids: string[]) => ({ sent: ids.filter((i) => mockWebSent.has(i)), failed: [] })),
}));
jest.mock("@/lib/journeyState", () => {
  const actual = jest.requireActual("@/lib/journeyState");
  return { ...actual, applyEvent: jest.fn(actual.applyEvent) };
});

// ---- in-memory database: just the query shapes these code paths use ----
type Row = Record<string, any>;
const mockDb: Record<string, Row[]> = {};
let mockSeq = 0;
const cmp = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);
function mockQuery(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let order: { col: string; asc: boolean } | null = null;
  let lim = Infinity;
  let patch: Row | null = null;
  const rows = () => (mockDb[table] ??= []);
  const run = () => {
    let out = rows().filter((r) => filters.every((f) => f(r)));
    if (order) { const o = order; out = [...out].sort((a, b) => (o.asc ? 1 : -1) * cmp(a[o.col], b[o.col])); }
    out = out.slice(0, lim);
    if (patch) for (const r of out) Object.assign(r, patch); // applied at once, as one statement
    return out.map((r) => ({ ...r }));
  };
  const q: any = {
    select: () => q,
    eq: (c: string, v: any) => (filters.push((r) => r[c] === v), q),
    neq: (c: string, v: any) => (filters.push((r) => JSON.stringify(r[c] ?? []) !== JSON.stringify(v === "{}" ? [] : v)), q),
    is: (c: string, v: any) => (filters.push((r) => (r[c] ?? null) === v), q),
    not: (c: string, _op: string, v: any) => (filters.push((r) => (r[c] ?? null) !== v), q),
    in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(r[c])), q),
    gt: (c: string, v: any) => (filters.push((r) => r[c] > v), q),
    gte: (c: string, v: any) => (filters.push((r) => r[c] >= v), q),
    lte: (c: string, v: any) => (filters.push((r) => r[c] != null && r[c] <= v), q),
    order: (c: string, o?: { ascending?: boolean }) => ((order = { col: c, asc: o?.ascending !== false }), q),
    limit: (n: number) => ((lim = n), q),
    single: async () => ({ data: run()[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (res: any, rej: any) => Promise.resolve({ data: run(), error: null }).then(res, rej),
    update: (v: Row) => ((patch = v), q),
    upsert: async (v: Row) => { rows().push({ ...v }); return { data: null, error: null }; },
    insert: (v: Row) => {
      const r = { id: `${table}-${++mockSeq}`, ...v, ...(table === "journey_state" ? { changed_at: new Date(Date.now() + mockSeq).toISOString() } : {}) };
      rows().push(r);
      const done: any = { then: (res: any) => res({ data: null, error: null }), select: () => ({ single: async () => ({ data: r }) }) };
      return done;
    },
  };
  return q;
}
// Fix lane F1: the 0036 atomic step (claim + sibling close + state row) stands in here over the
// same in-memory rows, because jest has no Postgres. The real SQL step is proven by
// supabase/tests/0036_*.test.sql on a real DB; this emulation checks the TS wiring only.
function mockResolveAndMove(p: any) {
  const reqs = (mockDb.cancel_requests ??= []);
  const target = reqs.find((r) => r.id === p.p_request_id);
  const claimable = p.p_claim_mode === "open" ? !!target && (target.resolved_at ?? null) === null : !!target && target.verdict === "distress";
  if (!claimable || !target) return [{ claimed: false, moved_state: null }];
  if (p.p_claim_mode === "open") Object.assign(target, { verdict: "cancel", resolved_at: new Date(Date.now()).toISOString() });
  else target.verdict = "cancel";
  if (p.p_close_siblings) for (const r of reqs) if (r.journey_id === p.p_journey_id && (r.resolved_at ?? null) === null) Object.assign(r, { verdict: "cancel", resolved_at: new Date(Date.now()).toISOString() });
  (mockDb.journey_state ??= []).push({ journey_id: p.p_journey_id, state: p.p_state, reason: p.p_reason, changed_by: p.p_actor, changed_at: new Date(Date.now() + (++mockSeq)).toISOString() });
  const j = (mockDb.journeys ?? []).find((x) => x.id === p.p_journey_id);
  if (j) Object.assign(j, { status: p.p_status, ending: p.p_ending, heightened: p.p_heightened, challenge_kind: p.p_challenge_kind, camera_paused_at: p.p_camera_paused_at, alarm_mode: p.p_alarm_mode });
  return [{ claimed: true, moved_state: p.p_state }];
}
jest.mock("@/lib/supabaseAdmin", () => ({
  admin: () => ({
    from: (t: string) => mockQuery(t),
    rpc: async (name: string, params?: any) => (name === "monitoring_snapshot" ? { data: mockSnapshot(), error: null } : name === "cancel_resolve_and_move" ? (mockRpcError ? { data: null, error: { message: mockRpcError } } : { data: mockResolveAndMove(params), error: null }) : { data: ++mockSeq, error: null }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  }),
}));
let mockSnapshot = (): Row[] => [];
// When set, the cancel_resolve_and_move rpc returns { data: null, error } - how supabase-js
// reports a real DB failure (missing function, timeout). It never throws (fix lane F1 defect).
let mockRpcError: string | null = null;

import { POST as END } from "@/app/api/guardian-end/route";
import { POST as VOTE } from "@/app/api/cancel-request/[id]/vote/route";
import { GET as DEADMAN } from "@/app/api/cron/deadman/route";
import GuardianPage from "@/app/g/[token]/page";
import { signGuardianToken, signCancelVoteToken } from "@/lib/token";
import { sendPush, sendEmail, notifyGuardians, notifyNearby } from "@/lib/alerts";
import { notifyContactsWebPush } from "@/lib/webPush";
import { applyEvent } from "@/lib/journeyState";

const J = "j1";
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
function seed({ verdict = "distress", status = "monitoring", state = "CRITICAL" }: { verdict?: string | null; status?: string; state?: string } = {}) {
  for (const k of Object.keys(mockDb)) delete mockDb[k];
  mockDb.journeys = [{ id: J, owner_id: "o1", status, alarm_mode: "silent", heightened: false, ending: false, from_label: "A", to_label: "B", profiles: { name: "Asha" } }];
  mockDb.journey_state = [{ journey_id: J, state, changed_at: ago(20) }];
  // c1, c2 asked in the current group; c3 in a dropped group; x9 belongs to someone else.
  mockDb.contacts = [
    { id: "c1", owner_id: "o1", name: "Ravi", email: null, linked_user_id: "u1", tier: "primary" },
    { id: "c2", owner_id: "o1", name: "Meera", email: null, linked_user_id: null, tier: "primary" },
    { id: "c3", owner_id: "o1", name: "Kiran", email: "mail-c3", linked_user_id: null, tier: "buffer" },
    { id: "x9", owner_id: "o2", name: "Stranger", email: "mail-x9", linked_user_id: null, tier: "primary" },
  ];
  mockDb.profiles = [{ id: "u1", expo_push_token: "TokU1" }];
  mockDb.cancel_requests = [
    { id: "r0", journey_id: J, owner_id: "o1", asked_contact_ids: ["c3"], verdict: null, resolved_at: ago(40), created_at: ago(45), method: "word" },
    { id: "r1", journey_id: J, owner_id: "o1", asked_contact_ids: ["c1", "c2"], verdict, resolved_at: ago(5), created_at: ago(10), method: "word", rolled_at: null, next_opened_at: null, phone_stage: null, ask_pending_ids: [] },
  ];
  mockDb.events = [];
  mockDb.cancel_votes = [];
}
const tok = (c: string | null, ttl?: number) => signGuardianToken(J, c, ttl);
const end = (t: string, confirm: string | null = "yes") => {
  const body = new URLSearchParams();
  if (confirm) body.set("confirm", confirm);
  return END(new Request(`http://x/api/guardian-end?t=${encodeURIComponent(t)}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" }, body }));
};
const render = async (t: string, endStep?: string) => renderToStaticMarkup(await GuardianPage({ params: Promise.resolve({ token: t }), searchParams: Promise.resolve({ end: endStep }) }));
const row = (id: string) => mockDb.cancel_requests.find((r) => r.id === id)!;
const newestState = () => [...mockDb.journey_state].sort((a, b) => cmp(b.changed_at, a.changed_at))[0].state;
const ev = (type: string) => mockDb.events.filter((e) => e.type === type);
const START = "I have spoken to her. End the alarm";
const QUESTION = "Only do this after speaking with her yourself. End the alarm?";

beforeEach(() => {
  jest.clearAllMocks();
  mockWebSent.clear();
  mockSnapshot = () => [];
  mockRpcError = null;
  seed();
});

describe("guardian page", () => {
  test("the action shows for her guardian when the newest request is distress and the alarm is live", async () => {
    const html = await render(tok("c1"));
    expect(html).toContain(START);
    expect(html).not.toContain(QUESTION);
  });

  test.each([
    ["a keep row", { verdict: "keep" }],
    ["an open request", { verdict: null }],
    ["an alarm a Safe already ended", { verdict: "cancel", state: "RESOLVED_MONITORING" }],
    ["a finished journey", { status: "done" }],
    ["an alarm no longer CRITICAL", { state: "RESOLVED_MONITORING" }],
  ])("not shown on %s", async (_n, s) => {
    seed(s as any);
    expect(await render(tok("c1"))).not.toContain(START);
  });

  test("not shown on a journey-only link or to someone who is not her guardian", async () => {
    expect(await render(tok(null))).not.toContain(START);
    expect(await render(tok("x9"))).not.toContain(START);
  });

  test("the first step only opens the question; nothing ends", async () => {
    const html = await render(tok("c1"), "1");
    expect(html).toContain(QUESTION);
    expect(html).toContain(">End</button>");
    expect(html).toContain("Go back");
    expect(html).toContain('name="confirm" value="yes"');
    expect(newestState()).toBe("CRITICAL");
    expect(row("r1").verdict).toBe("distress");
    expect(applyEvent).not.toHaveBeenCalled();
  });

  test("brief item 7: her guardian's link past its 24 h still reaches only the action while the alarm is live", async () => {
    const old = tok("c3", -1000);
    const html = await render(old);
    expect(html).toContain(START);
    expect(html).toContain("Link expired");
    expect(html).not.toContain('id="status"');
    seed({ verdict: "keep" });
    const off = await render(old);
    expect(off).not.toContain(START);
    expect(off).toContain("Link expired");
  });
});

describe("route", () => {
  test("confirm ends it exactly as an approved Safe: heightened monitoring, nothing to nearby, no alarm fan-out, logged", async () => {
    const res = await end(tok("c1"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("The alarm has ended");
    expect(newestState()).toBe("RESOLVED_MONITORING");
    expect(mockDb.journeys[0].heightened).toBe(true);
    expect(row("r1").verdict).toBe("cancel");
    expect(notifyGuardians).not.toHaveBeenCalled();
    expect(notifyNearby).not.toHaveBeenCalled();
    for (const c of (sendPush as jest.Mock).mock.calls) expect(c[4]).toBeUndefined(); // never the siren channel
    const logged = ev("guardian_ended_alarm");
    expect(logged).toHaveLength(1);
    expect(logged[0].payload).toMatchObject({ requestId: "r1", guardianContactId: "c1", linkExpired: false });
    expect(typeof logged[0].payload.at).toBe("string");
  });

  test("the normal Safe on that alarm is still refused", async () => {
    const res = await VOTE(
      new Request(`http://x/api/cancel-request/r1/vote?t=${encodeURIComponent(signCancelVoteToken("r1", "c1"))}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ safe: true }) }),
      { params: Promise.resolve({ id: "r1" }) },
    );
    expect(res.status).toBe(410);
    expect(newestState()).toBe("CRITICAL");
    expect(row("r1").verdict).toBe("distress");
  });

  // F9 (founder "Yes, same as Safe"): after a guardian END, two "Not safe" turn the alarm back on,
  // exactly as two "Not safe" overturn a normal Safe. The end stands in for that Safe.
  test("T25 after a guardian end, two Not safe turn the alarm back on", async () => {
    expect((await end(tok("c1"))).status).toBe(200); // c1 ends it after speaking to her
    expect(row("r1").verdict).toBe("cancel");
    expect(newestState()).toBe("RESOLVED_MONITORING");
    const vote = (c: string) => VOTE(
      new Request(`http://x/api/cancel-request/r1/vote?t=${encodeURIComponent(signCancelVoteToken("r1", c))}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ safe: false }) }),
      { params: Promise.resolve({ id: "r1" }) },
    );
    const first = await vote("c2"); // one Not safe: not enough, the alarm stays off
    expect((await first.json()).verdict).toBe("cancel");
    expect(newestState()).toBe("RESOLVED_MONITORING");
    const second = await vote("c1"); // the second Not safe: re-raised, exactly as after a Safe
    expect(second.status).toBe(200);
    expect((await second.json()).verdict).toBe("reraise");
    expect(newestState()).toBe("CRITICAL");
  });

  test("a post without the confirm ends nothing", async () => {
    expect((await end(tok("c1"), null)).status).toBe(400);
    expect((await end(tok("c1"), "true")).status).toBe(400);
    expect(newestState()).toBe("CRITICAL");
    expect(row("r1").verdict).toBe("distress");
  });

  test.each([
    ["keep row", { verdict: "keep" }],
    ["open request", { verdict: null }],
    ["finished journey", { status: "done" }],
    ["expired journey", { status: "expired" }],
    ["alarm no longer CRITICAL", { state: "EMERGENCY" }],
  ])("refused (410) on a %s; nothing changes and nobody is told", async (_n, s) => {
    seed(s as any);
    const before = JSON.stringify(mockDb.cancel_requests);
    expect((await end(tok("c1"))).status).toBe(410);
    expect(JSON.stringify(mockDb.cancel_requests)).toBe(before);
    expect(ev("guardian_ended_alarm")).toHaveLength(0);
    expect(ev("guardian_end_refused")).toHaveLength(1);
    expect(sendPush).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("bad, forged, journey-only or another person's guardian's token: 403, nothing changes", async () => {
    const good = tok("c1");
    const forged = good.slice(0, -2) + (good.endsWith("AA") ? "BB" : "AA");
    for (const t of ["", "nonsense", forged, tok(null), tok("x9"), signGuardianToken("other-journey", "c1")]) {
      expect((await end(t)).status).toBe(403);
    }
    expect(row("r1").verdict).toBe("distress");
    expect(newestState()).toBe("CRITICAL");
  });

  test("two guardians at once: exactly one applies it; the state moves once; others told once", async () => {
    const [a, b] = await Promise.all([end(tok("c1")), end(tok("c2"))]);
    expect([a.status, b.status].sort()).toEqual([200, 410]);
    expect(mockDb.journey_state.filter((s) => s.state === "RESOLVED_MONITORING")).toHaveLength(1);
    expect(ev("guardian_ended_alarm")).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  test("a repeat is harmless: 410, nothing more sent or logged as ended", async () => {
    expect((await end(tok("c1"))).status).toBe(200);
    jest.clearAllMocks();
    const res = await end(tok("c1"));
    expect(res.status).toBe(410);
    expect(await res.text()).toContain("already ended");
    expect(sendPush).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(ev("guardian_ended_alarm")).toHaveLength(1);
  });

  test("a guardian from a dropped group may use it with their own link", async () => {
    expect((await end(tok("c3"))).status).toBe(200);
    expect(ev("guardian_ended_alarm")[0].payload.guardianContactId).toBe("c3");
  });

  test("brief item 7: her guardian's own link past 24 h still works while the alarm is live, and is logged as such", async () => {
    expect((await end(tok("c2", -1000))).status).toBe(200);
    expect(ev("guardian_ended_alarm")[0].payload.linkExpired).toBe(true);
  });

  test("the other guardians are told once, one channel each: app, else browser, else email; the guardian who ended it is not", async () => {
    mockWebSent.add("c2");
    await end(tok("c3"));
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect((sendPush as jest.Mock).mock.calls[0][0]).toEqual(["TokU1"]);
    expect((sendPush as jest.Mock).mock.calls[0][2]).toBe("Her guardian Kiran ended the alarm after speaking with her. Monitoring continues.");
    expect((notifyContactsWebPush as jest.Mock).mock.calls[0][1]).toEqual(["c2"]);
    expect(sendEmail).not.toHaveBeenCalled(); // c3 ended it; c2 had the browser; x9 is not hers
    jest.clearAllMocks();
    mockWebSent.clear();
    seed();
    await end(tok("c1"));
    expect(sendPush).not.toHaveBeenCalled(); // c1 ended it and is the only app guardian
    expect((sendEmail as jest.Mock).mock.calls.map((c) => c[0])).toEqual([["mail-c3"]]); // c2 has no channel at all
  });

  test("the atomic step fails (rpc returns an error): 500, nobody told, logged, nothing changed; a retry ends it", async () => {
    // The real applyEvent runs here; the rpc reports a DB error the way supabase-js does
    // (data null + error, never a throw). The fix must log it and throw, not read claim_lost.
    mockRpcError = "function cancel_resolve_and_move does not exist";
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect((await end(tok("c1"))).status).toBe(500);
    expect(row("r1").verdict).toBe("distress"); // the atomic step wrote nothing
    expect(newestState()).toBe("CRITICAL");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled(); // the rpc error was logged
    spy.mockRestore();
    mockRpcError = null;
    expect((await end(tok("c1"))).status).toBe(200);
    expect(newestState()).toBe("RESOLVED_MONITORING");
  });

  test("the alarm moved first (her own SOS): the core keeps CRITICAL, nothing ends, 410", async () => {
    (applyEvent as jest.Mock).mockResolvedValueOnce({ state: "CRITICAL", actions: [], claimed: false, outcome: "no_change" });
    expect((await end(tok("c1"))).status).toBe(410);
    expect(row("r1").verdict).toBe("distress");
    expect(ev("guardian_ended_alarm")).toHaveLength(0);
  });

  test("afterwards the clock contacts nobody: no resend, no move, no silent-phone alert", async () => {
    await end(tok("c1"));
    jest.clearAllMocks();
    // Her phone silent for 20 min after the end; a fresh heartbeat so no gap re-raise.
    mockSnapshot = () => [{ journey_id: J, state: newestState(), last_heartbeat_at: new Date().toISOString(), last_frame_at: ago(20), state_changed_at: ago(20), battery: null, battery_low: false }];
    for (let i = 0; i < 3; i++) await DEADMAN(new Request("http://x/api/cron/deadman"));
    expect(sendPush).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(notifyContactsWebPush).not.toHaveBeenCalled();
    expect(notifyGuardians).not.toHaveBeenCalled();
    expect(ev("alarm_silent_progress")).toHaveLength(0);
  });

  test("control: before the end the same silent phone does get the silent-phone alert (the check above can fail)", async () => {
    mockSnapshot = () => [{ journey_id: J, state: "CRITICAL", last_heartbeat_at: ago(20), last_frame_at: ago(20), state_changed_at: ago(20), battery: null, battery_low: false }];
    await DEADMAN(new Request("http://x/api/cron/deadman"));
    expect(ev("alarm_silent_progress")).toHaveLength(1);
  });
});

// ---- Fix lane D7 (founder Q129-Q132, Q115): the end action follows the cancel group rotation ----
const T0 = Date.parse("2026-11-11T10:00:00.000Z"); // the moment of the emergency word
const atMin = (m: number) => jest.spyOn(Date, "now").mockReturnValue(T0 + m * 60_000);
const CLOSED = "You can&#x27;t end the alarm right now. Another group of her guardians has been asked.";
// Seven reachable guardians: groups [c1 c2 c3] [c4 c5 c6] [c7]. c1 has the app, the rest email.
function seed7() {
  seed();
  mockDb.contacts = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `c${n}`, owner_id: "o1", name: `G${n}`, email: n === 1 ? null : `mail-c${n}`, linked_user_id: n === 1 ? "u1" : null, tier: n <= 3 ? "primary" : "buffer", position: n }));
  mockDb.contacts.push({ id: "x9", owner_id: "o2", name: "Stranger", email: "mail-x9", linked_user_id: null, tier: "primary" });
  mockDb.journey_state[0].changed_at = new Date(T0 - 20 * 60_000).toISOString();
  Object.assign(row("r0"), { created_at: new Date(T0 - 45 * 60_000).toISOString(), resolved_at: new Date(T0 - 40 * 60_000).toISOString() });
  Object.assign(row("r1"), { resolved_at: new Date(T0).toISOString(), created_at: new Date(T0 - 20 * 60_000).toISOString(), resent_at: new Date(T0 - 5 * 60_000).toISOString() });
}
const tick = async (m: number) => { atMin(m); jest.clearAllMocks(); await DEADMAN(new Request("http://x/api/cron/deadman")); };
const emailed = () => (sendEmail as jest.Mock).mock.calls.map((c) => c[0][0]).sort();
const pushed = () => (sendPush as jest.Mock).mock.calls.map((c) => c[0][0]);

describe("D7 rotation: 1-3 guardians", () => {
  afterEach(() => jest.restoreAllMocks());
  test("open long after the word while the alarm is live; closed once the journey is completed", async () => {
    Object.assign(row("r1"), { resolved_at: new Date(T0).toISOString() });
    atMin(300);
    expect(await render(tok("c1"))).toContain(START);
    mockDb.journeys[0].status = "done";
    expect(await render(tok("c1"))).not.toContain(START);
    expect((await end(tok("c1"))).status).toBe(410);
  });
  test("no rotation messages: the word's alert already went to all of them", async () => {
    Object.assign(row("r1"), { resolved_at: new Date(T0).toISOString() });
    for (const m of [0, 15, 30]) { await tick(m); expect(sendEmail).not.toHaveBeenCalled(); expect(sendPush).not.toHaveBeenCalled(); }
  });
});

describe("D7 rotation: 4+ guardians", () => {
  beforeEach(() => seed7());
  afterEach(() => jest.restoreAllMocks());

  test("group 1 open from 0 to 35 min, closed at 36", async () => {
    for (const m of [0, 34, 35]) { atMin(m); expect(await render(tok("c2"))).toContain(START); }
    atMin(36);
    const html = await render(tok("c2"));
    expect(html).toContain(CLOSED);
    expect(html).not.toContain("?end=1");
    expect(html).not.toContain('name="confirm"');
    expect(await render(tok("c2"), "1")).not.toContain('name="confirm"');
    const res = await end(tok("c2"));
    expect(res.status).toBe(410);
    expect(await res.text()).toContain("Another group of her guardians has been asked");
    expect(row("r1").verdict).toBe("distress");
    expect(ev("guardian_end_refused")[0].payload.reason).toBe("window_closed");
  });

  test("group 2 closed before 30, open from 30 to 65, closed at 66", async () => {
    atMin(29); expect(await render(tok("c4"))).toContain(CLOSED);
    for (const m of [30, 50, 65]) { atMin(m); expect(await render(tok("c4"))).toContain(START); }
    atMin(66); expect(await render(tok("c4"))).toContain(CLOSED);
  });

  test("after the last group it wraps to group 1", async () => {
    atMin(60); expect(await render(tok("c7"))).toContain(START);
    atMin(89); expect(await render(tok("c1"))).toContain(CLOSED);
    atMin(90); expect(await render(tok("c1"))).toContain(START);
    expect(await render(tok("c7"))).toContain(START); // c7's last 5 min
    atMin(96); expect(await render(tok("c7"))).toContain(CLOSED);
  });

  test("an expired link outside the window shows the greyed action only", async () => {
    atMin(40);
    const html = await render(tok("c2", -1000));
    expect(html).toContain(CLOSED);
    expect(html).toContain("Link expired");
  });

  test("alerts: each group at its minute 0 and once more at 15, then the next group, wrapping", async () => {
    const seen: Record<number, string[]> = {};
    for (const m of [0, 1, 15, 16, 29, 30, 45, 46, 60, 75, 90]) {
      await tick(m);
      seen[m] = [...pushed(), ...emailed()];
    }
    const g1 = ["TokU1", "mail-c2", "mail-c3"];
    expect(seen).toEqual({
      0: g1, 1: [], 15: g1, 16: [], 29: [],
      30: ["mail-c4", "mail-c5", "mail-c6"], 45: ["mail-c4", "mail-c5", "mail-c6"], 46: [],
      60: ["mail-c7"], 75: ["mail-c7"], 90: g1,
    });
    expect(ev("guardian_end_rotation").map((e) => [e.payload.step, e.payload.groupIndex])).toEqual([[0, 0], [1, 0], [2, 1], [3, 1], [4, 2], [5, 2], [6, 0]]);
  });

  test("the alert carries the guardian's own page link, the app opens it like a cancel request, never the siren channel", async () => {
    await tick(0);
    const [toks, title, body, data, opts] = (sendPush as jest.Mock).mock.calls[0];
    expect(toks).toEqual(["TokU1"]);
    expect(title).toBe("She used her emergency word");
    expect(body).toBe("If you have spoken to her, you can end the alarm in the next 35 minutes.");
    expect(data).toMatchObject({ kind: "cancel_request", journeyId: J });
    expect(String(data.link)).toMatch(/^http:\/\/app\/g\//);
    expect(opts).toBeUndefined();
    expect((sendEmail as jest.Mock).mock.calls[0][2]).toContain("http://app/g/");
    await tick(15);
    expect((sendPush as jest.Mock).mock.calls[0][2]).toBe("If you have spoken to her, you can end the alarm in the next 20 minutes.");
  });

  test("a guardian with a working browser gets the browser only", async () => {
    mockWebSent.add("c2");
    await tick(0);
    expect(emailed()).toEqual(["mail-c3"]);
  });

  // F7 (founder: new guardian actions follow the cancel group rotation): one guardian's email
  // throwing does not stop the rest of the group, and the one it missed is resent to, like the ask.
  test("T23 one guardian's email fails: the others still get theirs, and the failed one is resent", async () => {
    let c2Fails = true;
    (sendEmail as jest.Mock).mockImplementation(async (to: string[]) => { if (c2Fails && to[0] === "mail-c2") throw new Error("smtp down"); });
    await tick(0); // step 0 -> group 1 [c1 (app), c2 (email), c3 (email)]
    expect(pushed()).toEqual(["TokU1"]); // c1 reached
    expect(emailed()).toEqual(["mail-c2", "mail-c3"]); // c2 attempted+failed, c3 is STILL reached
    expect(row("r1").ask_pending_ids).toEqual(["c2"]); // the failed one recorded for the resend
    c2Fails = false;
    await tick(3); // > CLAIM_LEASE_MS later: the one guardian the step missed is resent to, alone
    expect(emailed()).toEqual(["mail-c2"]);
    expect(pushed()).toEqual([]); // nobody already reached is sent again
    expect(row("r1").ask_pending_ids).toEqual([]); // reached now, nothing left to resend
    expect(ev("guardian_end_ask_retried")).toHaveLength(1);
  });

  test("two ticks at once send a step once", async () => {
    atMin(0);
    await Promise.all([DEADMAN(new Request("http://x/api/cron/deadman")), DEADMAN(new Request("http://x/api/cron/deadman"))]);
    expect(emailed()).toEqual(["mail-c2", "mail-c3"]);
  });

  test("stops at once when the alarm ends: by the action, by her state moving, by the journey completing", async () => {
    atMin(5);
    expect((await end(tok("c1"))).status).toBe(200);
    await tick(15); await tick(30);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(ev("guardian_end_rotation")).toHaveLength(0);
    seed7(); mockDb.journey_state.push({ journey_id: J, state: "RESOLVED_MONITORING", changed_at: new Date(Date.now() + 1e6).toISOString() });
    await tick(30); expect(sendEmail).not.toHaveBeenCalled();
    seed7(); mockDb.journeys[0].status = "done";
    await tick(30); expect(sendEmail).not.toHaveBeenCalled();
  });

  test("a drill never reaches the server: a journey with no emergency-word row contacts nobody", async () => {
    mockDb.cancel_requests = [];
    await tick(0); await tick(15);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendPush).not.toHaveBeenCalled();
  });

  test("two guardians of the open group at once: one ends it", async () => {
    atMin(10);
    const [a, b] = await Promise.all([end(tok("c2")), end(tok("c3"))]);
    expect([a.status, b.status].sort()).toEqual([200, 410]);
    expect(mockDb.journey_state.filter((s) => s.state === "RESOLVED_MONITORING")).toHaveLength(1);
  });
});

describe("D7 item 9: the guardian app, same rules with the signed-in guardian's own authority", () => {
  const { requireUser } = jest.requireMock("@/lib/auth") as { requireUser: jest.Mock };
  const asUser = (id: string | null) => requireUser.mockImplementation(async () => { if (!id) throw new Response("unauthorized", { status: 401 }); return { id }; });
  const status = async () => {
    const { GET: STATUS } = require("@/app/api/guardian-end/route");
    return STATUS(new Request(`http://x/api/guardian-end?journeyId=${J}`, { headers: { authorization: "Bearer x" } })) as Promise<Response>;
  };
  const appEnd = (confirm: string | null = "yes") => END(new Request(`http://x/api/guardian-end?journeyId=${J}`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer x" }, body: JSON.stringify(confirm ? { confirm } : {}) }));
  beforeEach(() => seed7());
  afterEach(() => jest.restoreAllMocks());

  test("status: open in her group's window, closed outside, none when not allowed", async () => {
    asUser("u1");
    atMin(10); expect(await (await status()).json()).toEqual({ end: "open" });
    atMin(40); expect(await (await status()).json()).toEqual({ end: "closed" });
    row("r1").verdict = "keep";
    expect(await (await status()).json()).toEqual({ end: "none" });
    asUser("u-not-hers");
    expect(await (await status()).json()).toEqual({ end: "none" });
    asUser(null);
    expect((await status()).status).toBe(401);
  });

  test("end: needs the confirm, ends inside the window, refused outside, someone else's account refused", async () => {
    asUser("u1"); atMin(10);
    expect((await appEnd(null)).status).toBe(400);
    expect(row("r1").verdict).toBe("distress");
    atMin(40);
    const off = await appEnd();
    expect(off.status).toBe(410);
    expect(await off.json()).toMatchObject({ result: "refused", reason: "window_closed" });
    asUser("u-not-hers"); atMin(10);
    expect((await appEnd()).status).toBe(403);
    asUser("u1");
    const ok = await appEnd();
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ result: "ended", state: "RESOLVED_MONITORING" });
    expect(ev("guardian_ended_alarm")[0].payload).toMatchObject({ guardianContactId: "c1", via: "app" });
  });

  // Owner Q116, Q125: only a guardian who spoke to her ends it. Her own account linked as one of
  // her contacts (her own number saved, or the link set by hand) must never count.
  test("her own account linked as her guardian: no action, end refused", async () => {
    mockDb.contacts.find((c) => c.id === "c2")!.linked_user_id = "o1";
    asUser("o1"); atMin(10);
    expect(await (await status()).json()).toEqual({ end: "none" });
    expect((await appEnd()).status).toBe(403);
    expect(row("r1").verdict).toBe("distress");
  });
});
