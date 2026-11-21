// D4 H1: what the server must hear is saved on the phone and delivered in order until it has it.
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockPost = jest.fn();
jest.mock("../../lib/api", () => ({ post: (...a: unknown[]) => mockPost(...a) }));
const mockSend = jest.fn().mockResolvedValue(undefined);
jest.mock("../protocolRunner", () => ({ runner: { send: (...a: unknown[]) => mockSend(...a) } }));

import { initialContext } from "@vaira/core";
import { eventOutbox, OUTBOX_RETRY_MS } from "../eventOutbox";
import { cancelOfflineMarker } from "../cancelOfflineMarker";
import { useJourney } from "../../store/journey";

const WORD = { type: "KEYWORD", kind: "emergency" } as const;
const offline = () => mockPost.mockRejectedValue(new TypeError("Network request failed"));
const online = () => mockPost.mockReset().mockResolvedValue({});
const paths = () => mockPost.mock.calls.map((c) => c[0]);

beforeEach(async () => {
  await AsyncStorage.clear();
  eventOutbox.resetForTest();
  mockPost.mockReset();
  mockSend.mockClear();
  useJourney.getState().reset();
});
afterEach(() => eventOutbox.resetForTest());

test("offline correct word then emergency word: both reach the server, in order, once", async () => {
  offline();
  await eventOutbox.ensureCancel("j1", "silent");
  await eventOutbox.add({ journeyId: "j1", kind: "event", event: WORD });
  await eventOutbox.deliver();
  expect(await eventOutbox.pending()).toBe(2);
  online();
  await eventOutbox.deliver();
  expect(paths()).toEqual(["/api/cancel-request", "/api/journey-state"]);
  expect(mockPost.mock.calls[0][1]).toMatchObject({ journeyId: "j1", method: "word", alarmMode: "silent" });
  expect(mockPost.mock.calls[1][1]).toEqual({ journeyId: "j1", event: WORD });
  expect(await eventOutbox.pending()).toBe(0);
});

test("a restart loses nothing: the queue is on the phone, not in memory", async () => {
  await eventOutbox.add({ journeyId: "j1", kind: "event", event: WORD });
  eventOutbox.resetForTest(); // all that memory holds
  expect(await eventOutbox.pending()).toBe(1);
  mockPost.mockResolvedValue({});
  await eventOutbox.deliver();
  expect(paths()).toEqual(["/api/journey-state"]);
});

test("keeps trying by itself on a timer until delivered", async () => {
  jest.useFakeTimers();
  try {
    offline();
    await eventOutbox.add({ journeyId: "j1", kind: "event", event: WORD });
    await eventOutbox.deliver();
    expect(mockPost).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(OUTBOX_RETRY_MS);
    expect(mockPost).toHaveBeenCalledTimes(2);
    online();
    await jest.advanceTimersByTimeAsync(OUTBOX_RETRY_MS);
    expect(await eventOutbox.pending()).toBe(0);
    mockPost.mockClear();
    await jest.advanceTimersByTimeAsync(OUTBOX_RETRY_MS * 3);
    expect(mockPost).not.toHaveBeenCalled();
  } finally { jest.useRealTimers(); }
});

test.each([["500", 1], ["401", 1], ["403", 0], ["404", 0]])("server says %s: kept=%i", async (code, kept) => {
  mockPost.mockRejectedValue(new Error(`/api/journey-state ${code}`));
  await eventOutbox.add({ journeyId: "j1", kind: "event", event: WORD });
  await eventOutbox.deliver();
  expect(await eventOutbox.pending()).toBe(kept);
});

test("a final refusal does not block what is behind it", async () => {
  mockPost.mockRejectedValueOnce(new Error("/api/journey-state 403")).mockResolvedValue({});
  await eventOutbox.add({ journeyId: "other", kind: "event", event: WORD });
  await eventOutbox.add({ journeyId: "j1", kind: "event", event: WORD });
  await eventOutbox.deliver();
  expect(mockPost).toHaveBeenCalledTimes(2);
  expect(await eventOutbox.pending()).toBe(0);
});

test("the one the runner is posting itself is not sent twice", async () => {
  mockPost.mockResolvedValue({});
  const id = await eventOutbox.add({ journeyId: "j1", kind: "event", event: WORD }, true);
  await eventOutbox.deliver();
  expect(mockPost).not.toHaveBeenCalled();
  await eventOutbox.remove(id);
});

test("cancel delivered: the offline flag and marker go, the wait goes on", async () => {
  useJourney.getState().set({ cancelOffline: true, ctx: { ...initialContext(), state: "CRITICAL", cancelWaiting: true } });
  await cancelOfflineMarker.save({ id: "j1", owner_id: "o1" });
  mockPost.mockResolvedValue({ requestId: "r1", asked: [] });
  await eventOutbox.ensureCancel("j1");
  await eventOutbox.ensureCancel("j1"); // a second call adds nothing
  await eventOutbox.deliver();
  expect(mockPost).toHaveBeenCalledTimes(1);
  expect(useJourney.getState().cancelOffline).toBe(false);
  expect(await cancelOfflineMarker.read()).toBeNull();
  expect(mockSend).not.toHaveBeenCalled();
});

test("cancel refused (409) while waiting: the alarm comes back; quiet already: nothing", async () => {
  mockPost.mockRejectedValue(new Error("/api/cancel-request 409"));
  useJourney.getState().set({ cancelOffline: true, ctx: { ...initialContext(), state: "CRITICAL", cancelWaiting: true } });
  await eventOutbox.ensureCancel("j1");
  await eventOutbox.deliver();
  expect(mockSend).toHaveBeenCalledWith({ type: "GUARDIAN_SAYS_WRONG" });
  mockSend.mockClear();
  useJourney.getState().set({ ctx: { ...initialContext(), state: "CRITICAL", quietAlarm: true } });
  await eventOutbox.ensureCancel("j1");
  await eventOutbox.deliver();
  expect(mockSend).not.toHaveBeenCalled();
});

test("quiet marker stays until the server has everything, then goes", async () => {
  useJourney.getState().set({ ctx: { ...initialContext(), state: "CRITICAL", quietAlarm: true } });
  await cancelOfflineMarker.save({ id: "j1", owner_id: "o1", quiet: true });
  offline();
  await eventOutbox.ensureCancel("j1");
  await eventOutbox.add({ journeyId: "j1", kind: "event", event: WORD });
  await eventOutbox.deliver();
  expect((await cancelOfflineMarker.read())?.quiet).toBe(true);
  online();
  await eventOutbox.deliver();
  expect(await cancelOfflineMarker.read()).toBeNull();
});
