// Owner 2026-11-12 "fix all three" (REVIEW3-ORCHESTRATOR-NOTES): a hung request is cut off, a
// damaged queue is kept aside and logged instead of silently lost, and a lost sign-in is renewed
// and then retried more slowly instead of every 15 s forever.
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockPost = jest.fn();
jest.mock("../lib/api", () => ({ post: (...a: unknown[]) => mockPost(...a), get: jest.fn() }));
const mockRefresh = jest.fn();
jest.mock("../lib/supabase", () => ({ supabase: { auth: { refreshSession: () => mockRefresh() } } }));

import { eventOutbox, OUTBOX_RETRY_MS, OUTBOX_AUTH_RETRY_MS } from "../services/eventOutbox";

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

beforeEach(async () => {
  await AsyncStorage.clear();
  eventOutbox.resetForTest();
  mockPost.mockReset();
  mockRefresh.mockReset();
});

test("a damaged queue is kept aside under its own key and logged, not silently overwritten", async () => {
  const err = jest.spyOn(console, "error").mockImplementation(() => {});
  await AsyncStorage.setItem("vaira.eventOutbox", "{not json");
  expect(await eventOutbox.pending()).toBe(0);
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith("vaira.eventOutbox.damaged."));
  expect(keys).toHaveLength(1);
  expect(await AsyncStorage.getItem(keys[0])).toBe("{not json");
  expect(err).toHaveBeenCalled();
  // New events still queue normally afterwards.
  await eventOutbox.add({ journeyId: "j1", kind: "event", event: { type: "KEYWORD" } as never });
  expect(await eventOutbox.pending()).toBe(1);
  err.mockRestore();
});

test("401: the sign-in is renewed once and the event is sent again at once", async () => {
  mockPost.mockRejectedValueOnce(new Error("/api/journey-state 401")).mockResolvedValueOnce({});
  mockRefresh.mockResolvedValue({ data: { session: {} }, error: null });
  await eventOutbox.add({ journeyId: "j1", kind: "event", event: { type: "KEYWORD" } as never });
  await eventOutbox.deliver();
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(mockPost).toHaveBeenCalledTimes(2);
  expect(await eventOutbox.pending()).toBe(0);
});

// F6: a 429 (too many requests) or 408 (timeout) is transient, not a final refusal; the SOS is kept
// and resent when the server is ready, exactly like after a network failure.
test.each([["429"], ["408"]])("T21 server answers %s to an SOS: it is kept and resent", async (code) => {
  mockPost.mockRejectedValueOnce(new Error(`/api/journey-state ${code}`));
  await eventOutbox.add({ journeyId: "j1", kind: "event", event: { type: "KEYWORD" } as never });
  await eventOutbox.deliver();
  expect(await eventOutbox.pending()).toBe(1); // not dropped as a refusal
  mockPost.mockReset();
  mockPost.mockResolvedValue({});
  await eventOutbox.deliver();
  expect(await eventOutbox.pending()).toBe(0); // resent and cleared
  eventOutbox.resetForTest();
});

// F6: if the phone's storage read throws, that run writes nothing - the waiting list is never
// overwritten with an empty queue - and the error is logged.
test("T22 storage read throws: the waiting list is not overwritten", async () => {
  await eventOutbox.add({ journeyId: "j1", kind: "event", event: { type: "KEYWORD" } as never });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const err = jest.spyOn(console, "error").mockImplementation(() => {});
  // The next read throws; later reads fall back to the real store, so no restore is needed.
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error("storage unavailable")));
  await eventOutbox.add({ journeyId: "j2", kind: "event", event: { type: "KEYWORD" } as never }); // read throws -> nothing written
  const raw = JSON.parse((await AsyncStorage.getItem("vaira.eventOutbox")) ?? "[]");
  expect(raw).toHaveLength(1); // the original is intact, not replaced by [j2] and not emptied
  expect(raw[0].journeyId).toBe("j1");
  expect(err).toHaveBeenCalled(); // the read failure was logged
  warn.mockRestore();
  err.mockRestore();
});

test("401 that renewing cannot fix: the event is kept and retried at the slower pace, not every 15 s", async () => {
  jest.useFakeTimers();
  try {
    mockPost.mockRejectedValue(new Error("/api/journey-state 401"));
    mockRefresh.mockResolvedValue({ data: { session: null }, error: { message: "refresh failed" } });
    await eventOutbox.add({ journeyId: "j1", kind: "event", event: { type: "KEYWORD" } as never });
    await eventOutbox.deliver();
    await flush();
    const calls = mockPost.mock.calls.length;
    expect(await eventOutbox.pending()).toBe(1);
    jest.advanceTimersByTime(OUTBOX_RETRY_MS + 1);
    await flush();
    expect(mockPost.mock.calls.length).toBe(calls);
    jest.advanceTimersByTime(OUTBOX_AUTH_RETRY_MS);
    await flush();
    expect(mockPost.mock.calls.length).toBeGreaterThan(calls);
    expect(await eventOutbox.pending()).toBe(1);
  } finally {
    jest.useRealTimers();
  }
});
