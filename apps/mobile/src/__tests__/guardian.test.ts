jest.useFakeTimers();

const mockPost = jest.fn().mockResolvedValue({ ok: true });
const mockGet = jest.fn();
jest.mock("../lib/api", () => ({ post: (...a: any[]) => mockPost(...a), get: (...a: any[]) => mockGet(...a) }));
const mockLog = jest.fn().mockResolvedValue(undefined);
const mockFlush = jest.fn().mockResolvedValue(undefined);
jest.mock("../lib/events", () => ({ events: { log: (...a: any[]) => mockLog(...a), flush: () => mockFlush() } }));
jest.mock("../lib/supabase", () => ({ supabase: { from: jest.fn() } }));

import { patchCountdown, guardian } from "../services/guardian";
import { supabase } from "../lib/supabase";

beforeEach(() => {
  mockPost.mockClear();
  mockLog.mockClear();
  mockFlush.mockClear();
});

test("patch countdown auto-declines at 5 s unless cancelled", () => {
  const yes = jest.fn(),
    no = jest.fn();
  patchCountdown(yes, no);
  jest.advanceTimersByTime(4999);
  expect(no).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(no).toHaveBeenCalled();
  const no2 = jest.fn();
  const cancel = patchCountdown(jest.fn(), no2);
  cancel();
  jest.advanceTimersByTime(6000);
  expect(no2).not.toHaveBeenCalled();
});

test("patch countdown honours a custom duration and never auto-calls onYes", () => {
  const yes = jest.fn(),
    no = jest.fn();
  patchCountdown(yes, no, 3000);
  jest.advanceTimersByTime(2999);
  expect(no).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(no).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(60_000);
  expect(yes).not.toHaveBeenCalled();
  expect(no).toHaveBeenCalledTimes(1);
});

test("respond / heartbeat / checkOnHer / raiseSos post the documented shapes", () => {
  guardian.respond("j1", "accept");
  expect(mockPost).toHaveBeenLastCalledWith("/api/monitoring", { action: "respond", journeyId: "j1", response: "accept" });
  guardian.heartbeat("j1");
  expect(mockPost).toHaveBeenLastCalledWith("/api/monitoring", { action: "heartbeat", journeyId: "j1" });
  guardian.checkOnHer("j1");
  expect(mockPost).toHaveBeenLastCalledWith("/api/journey-state", { journeyId: "j1", event: { type: "GUARDIAN_CONCERN" } });
  guardian.raiseSos("j1");
  expect(mockPost).toHaveBeenLastCalledWith("/api/journey-state", { journeyId: "j1", event: { type: "SOS" } });
});

test("confirmSafe logs, flushes, then posts to cancel-confirm in order", async () => {
  await guardian.confirmSafe("j2");
  expect(mockLog).toHaveBeenCalledWith("guardian_cancel_result", { result: "safe" }, "j2");
  expect(mockFlush).toHaveBeenCalledTimes(1);
  expect(mockPost).toHaveBeenCalledWith("/api/cancel-confirm", { journeyId: "j2", result: "safe" });
  expect(mockLog.mock.invocationCallOrder[0]).toBeLessThan(mockFlush.mock.invocationCallOrder[0]);
  expect(mockFlush.mock.invocationCallOrder[0]).toBeLessThan(mockPost.mock.invocationCallOrder[0]);
});

test("somethingWrong and lateConfirm carry their event payloads", async () => {
  await guardian.somethingWrong("j3");
  expect(mockLog).toHaveBeenLastCalledWith("guardian_cancel_result", { result: "wrong" }, "j3");
  expect(mockPost).toHaveBeenLastCalledWith("/api/cancel-confirm", { journeyId: "j3", result: "wrong" });
  await guardian.lateConfirm("j3", false);
  expect(mockLog).toHaveBeenLastCalledWith("guardian_late_confirm", { safe: false }, "j3");
  expect(mockPost).toHaveBeenLastCalledWith("/api/journey-state", { journeyId: "j3", event: { type: "GUARDIAN_LATE_CONFIRM", safe: false } });
});

test("trustees folds each contact's latest journey + state and defaults a missing name", async () => {
  const contacts = [
    { id: "c1", owner_id: "o1", tier: "primary", profiles: { name: "Asha" } },
    { id: "c2", owner_id: "o2", tier: "buffer", profiles: null },
  ];
  const contactsQ = { select: () => ({ eq: () => Promise.resolve({ data: contacts }) }) };
  const journeyFor: Record<string, any> = {
    o1: { id: "j-o1", from_label: "Home", to_label: "Work", start_at: "2026-09-05T09:00:00Z" },
    o2: null,
  };
  const journeysQ = {
    select: () => ({
      eq: (_c: string, owner: string) => ({
        in: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: journeyFor[owner] }) }) }) }),
      }),
    }),
  };
  const stateQ = {
    select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { state: "SAFE" } }) }) }) }) }),
  };
  (supabase.from as jest.Mock).mockImplementation((t: string) =>
    t === "contacts" ? contactsQ : t === "journeys_v" ? journeysQ : stateQ
  );
  const out = await guardian.trustees("me");
  expect(out).toHaveLength(2);
  expect(out[0]).toMatchObject({ name: "Asha", tier: "primary", journey: { id: "j-o1", state: "SAFE", from: "Home", to: "Work" } });
  expect(out[1]).toMatchObject({ name: "Trustee", tier: "buffer" });
  expect(out[1].journey).toBeUndefined();
});

// Fix lane D7 item 9: the in-app end action uses the guardian's own signed-in account.
test("endStatus asks the guardian-end route for this journey; endAlarm posts the confirm", async () => {
  mockGet.mockResolvedValueOnce({ end: "open" });
  expect(await guardian.endStatus("j 1")).toEqual({ end: "open" });
  expect(mockGet).toHaveBeenCalledWith("/api/guardian-end?journeyId=j%201");
  await guardian.endAlarm("j 1");
  expect(mockPost).toHaveBeenCalledWith("/api/guardian-end?journeyId=j%201", { confirm: "yes" });
});
