// Fix AD round 2 / A T1 + G1 + G2 (founder Q77, Q95, Q101): the correct word keeps the
// alarm CRITICAL, turns the siren off and opens a 30-minute guardian window. There is
// no 2-minute timeout any more. Only a guardian answer moves the state.
import { transition } from "../protocol";
import { CANCEL_GROUP_WINDOW_MS, CANCEL_RESEND_AT_MS, CANCEL_LATE_SAFE_MS, cancelSafeOpen } from "../timers";
import * as timers from "../timers";
import type { ProtocolContext } from "../types";

const critical: ProtocolContext = { state: "CRITICAL", ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" };
const waiting = () => transition(critical, { type: "CANCEL_REQUESTED", method: "word" });

test("G1: 30-minute group window, resend at minute 15, late Safe 5 minutes, no 2-minute constant", () => {
  expect(CANCEL_GROUP_WINDOW_MS).toBe(30 * 60_000);
  expect(CANCEL_RESEND_AT_MS).toBe(15 * 60_000);
  expect(CANCEL_LATE_SAFE_MS).toBe(5 * 60_000);
  expect((timers as Record<string, unknown>).CANCEL_GUARDIAN_MS).toBeUndefined();
});

test("G2: correct word stays CRITICAL, siren held, no CRITICAL fan-out, nothing to nearby", () => {
  const r = waiting();
  expect(r.ctx.state).toBe("CRITICAL");
  expect(r.ctx.cancelWaiting).toBe(true);
  expect(r.actions).toContain("SIREN_HOLD");
  for (const a of ["SIREN_ON", "NOTIFY_ALL_CRITICAL", "NOTIFY_NEARBY"]) expect(r.actions).not.toContain(a);
});

test("G2: a repeated CANCEL_REQUESTED (route + phone) does nothing more", () => {
  const again = transition(waiting().ctx, { type: "CANCEL_REQUESTED", method: "word" });
  expect(again.ctx.cancelWaiting).toBe(true);
  expect(again.actions).toEqual([]);
});

test("A T1: guardian Safe while waiting ends the alarm (heightened monitoring)", () => {
  const r = transition(waiting().ctx, { type: "GUARDIAN_VOTE", safe: true, contactId: "c1" });
  expect(r.ctx.state).toBe("RESOLVED_MONITORING");
  expect(r.ctx.cancelWaiting).toBeFalsy();
  expect(r.actions).toContain("SIREN_OFF");
});

test("Not safe keeps today's rules: a single vote stays open; keep verdict brings the siren back", () => {
  const one = transition(waiting().ctx, { type: "GUARDIAN_VOTE", safe: false, contactId: "c1" });
  expect(one.ctx.cancelWaiting).toBe(true);
  const kept = transition(waiting().ctx, { type: "GUARDIAN_SAYS_WRONG" });
  expect(kept.ctx.state).toBe("CRITICAL");
  expect(kept.ctx.cancelWaiting).toBeFalsy();
  expect(kept.actions).toContain("SIREN_ON");
});

test("a silent alarm stays silent on the keep verdict", () => {
  const silent = transition({ ...critical, alarmMode: "silent" }, { type: "CANCEL_REQUESTED", method: "word" });
  expect(silent.actions).not.toContain("SIREN_HOLD");
  expect(transition(silent.ctx, { type: "GUARDIAN_SAYS_WRONG" }).actions).not.toContain("SIREN_ON");
});

test("no guardian vote moves a CRITICAL alarm that has no open request", () => {
  expect(transition(critical, { type: "GUARDIAN_VOTE", safe: true, contactId: "c1" }).ctx.state).toBe("CRITICAL");
  expect(transition(critical, { type: "GUARDIAN_SAYS_WRONG" }).actions).toEqual([]);
});

test("her own SOS while waiting ends the waiting; End and Arrive are ignored", () => {
  expect(transition(waiting().ctx, { type: "SOS", mode: "siren" }).ctx.cancelWaiting).toBeFalsy();
  for (const type of ["END", "ARRIVED"] as const) {
    const r = transition(waiting().ctx, { type });
    expect(r.ctx.state).toBe("CRITICAL");
    expect(r.ctx.cancelWaiting).toBe(true);
    expect(r.actions).toEqual([]);
  }
});

test("G7: Safe is open for the window plus 5 minutes, closed after", () => {
  const t0 = 1_000_000;
  expect(cancelSafeOpen(t0, t0 + 35 * 60_000)).toBe(true);
  expect(cancelSafeOpen(t0, t0 + 35 * 60_000 + 1)).toBe(false);
});

// Fix lane D3-5 (founder Q116).
describe("emergency word while a cancel waits", () => {
  const waiting = { state: "CRITICAL" as const, ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const, cancelWaiting: true };
  test("request off, quiet on, guardians re-alerted, no siren, no nearby, state unchanged", () => {
    const r = transition(waiting, { type: "KEYWORD", kind: "emergency" });
    expect(r.ctx).toMatchObject({ state: "CRITICAL", quietAlarm: true });
    expect(r.ctx.cancelWaiting).toBeFalsy();
    expect(r.actions).toEqual(["NOTIFY_ALL_CRITICAL"]);
  });
  test("Safe can no longer end it", () => {
    const q = transition(waiting, { type: "KEYWORD", kind: "help" }).ctx;
    expect(transition(q, { type: "GUARDIAN_VOTE", safe: true, contactId: "c" }).ctx.state).toBe("CRITICAL");
  });
  test("a second word does not alert again", () => {
    const q = transition(waiting, { type: "KEYWORD", kind: "sos" }).ctx;
    expect(transition(q, { type: "KEYWORD", kind: "sos" }).actions).toEqual([]);
  });
  test("her own SOS brings the full alarm back", () => {
    const q = transition(waiting, { type: "KEYWORD", kind: "sos" }).ctx;
    const r = transition(q, { type: "SOS", mode: "siren" });
    expect(r.ctx.quietAlarm).toBeFalsy();
    expect(r.actions).toContain("SIREN_ON");
  });
  test("no request waiting: still a no-op", () => {
    const r = transition({ ...waiting, cancelWaiting: false }, { type: "KEYWORD", kind: "emergency" });
    expect(r.actions).toEqual([]);
    expect(r.ctx.quietAlarm).toBeFalsy();
  });
  test("danger score 3 while waiting: no-op", () => {
    expect(transition(waiting, { type: "SCORE", score: 3, reasons: [] } as never).actions).toEqual([]);
  });
});
