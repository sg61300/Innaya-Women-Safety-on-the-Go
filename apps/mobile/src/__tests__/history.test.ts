// Task 34 — history service: false-alarm rate + the four Supabase reads/writes
// the History tab and admin timeline consume. Supabase is mocked with a tiny
// chainable builder so the exact table/column/filter/order shapes are asserted.

jest.mock("../lib/supabase", () => ({ supabase: { from: jest.fn() } }));

import { falseAlarmRate, history } from "../services/history";
import { supabase } from "../lib/supabase";

const fromMock = supabase.from as jest.Mock;

// A chainable query stub: every builder method returns the same object, and the
// object is a thenable resolving to { data }. Records the calls for assertions.
function stubQuery(data: any) {
  const calls: Record<string, any[][]> = {};
  const q: any = {};
  for (const m of ["select", "eq", "order", "update"] as const) {
    q[m] = (...a: any[]) => {
      (calls[m] ??= []).push(a);
      return q;
    };
  }
  q.then = (res: any) => Promise.resolve({ data }).then(res);
  q.__calls = calls;
  return q;
}

beforeEach(() => fromMock.mockReset());

test("false alarm rate", () => {
  expect(
    falseAlarmRate([{ user_feedback: "genuine" }, { user_feedback: "false_alarm" }, { user_feedback: null }])
  ).toBe(0.5);
  expect(falseAlarmRate([])).toBe(0);
});

test("false alarm rate ignores unknown/null and never divides by zero", () => {
  expect(falseAlarmRate([{ user_feedback: null }, { user_feedback: "pending" as any }])).toBe(0);
  expect(falseAlarmRate([{ user_feedback: "false_alarm" }])).toBe(1);
  expect(falseAlarmRate([{ user_feedback: "genuine" }])).toBe(0);
});

test("journeys reads journeys_v for the owner, newest first", async () => {
  const q = stubQuery([{ id: "j1" }]);
  fromMock.mockReturnValue(q);
  const rows = await history.journeys("u1");
  expect(fromMock).toHaveBeenCalledWith("journeys_v");
  expect(q.__calls.eq[0]).toEqual(["owner_id", "u1"]);
  expect(q.__calls.order[0]).toEqual(["start_at", { ascending: false }]);
  expect(rows).toEqual([{ id: "j1" }]);
});

test("journeys returns [] when data is null", async () => {
  fromMock.mockReturnValue(stubQuery(null));
  expect(await history.journeys("u1")).toEqual([]);
});

test("alerts reads state_change events for the journey, ordered by seq", async () => {
  const q = stubQuery([{ id: 7 }]);
  fromMock.mockReturnValue(q);
  const rows = await history.alerts("j1");
  expect(fromMock).toHaveBeenCalledWith("events");
  expect(q.__calls.eq).toEqual([["journey_id", "j1"], ["type", "state_change"]]);
  expect(q.__calls.order[0]).toEqual(["seq"]);
  expect(rows).toEqual([{ id: 7 }]);
});

test("feedback updates the event row by id", async () => {
  const q = stubQuery(null);
  fromMock.mockReturnValue(q);
  history.feedback(7, "false_alarm");
  expect(fromMock).toHaveBeenCalledWith("events");
  expect(q.__calls.update[0]).toEqual([{ user_feedback: "false_alarm" }]);
  expect(q.__calls.eq[0]).toEqual(["id", 7]);
});

test("timeline reads all events for the journey ordered by seq", async () => {
  const q = stubQuery([{ seq: 1 }]);
  fromMock.mockReturnValue(q);
  const rows = await history.timeline("j1");
  expect(fromMock).toHaveBeenCalledWith("events");
  expect(q.__calls.eq[0]).toEqual(["journey_id", "j1"]);
  expect(q.__calls.order[0]).toEqual(["seq"]);
  expect(rows).toEqual([{ seq: 1 }]);
});
