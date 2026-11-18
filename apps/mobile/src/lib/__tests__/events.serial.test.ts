// D4 low: the events queue is one writer at a time, so nothing is lost or sent twice.
import AsyncStorage from "@react-native-async-storage/async-storage";
const mockInsert = jest.fn();
jest.mock("../supabase", () => ({ supabase: { from: () => ({ insert: (...a: unknown[]) => mockInsert(...a) }) } }));
jest.mock("../analytics", () => ({ analytics: { track: jest.fn() } }));
import { events } from "../events";

const queue = async () => JSON.parse((await AsyncStorage.getItem("vaira.events.queue")) ?? "[]") as { type: string }[];

beforeEach(async () => { await AsyncStorage.clear(); mockInsert.mockReset(); mockInsert.mockResolvedValue({ error: null }); });

test("many logs at once: none lost", async () => {
  await Promise.all(Array.from({ length: 20 }, (_, i) => events.log(`e${i}`)));
  expect((await queue()).map((e) => e.type)).toEqual(Array.from({ length: 20 }, (_, i) => `e${i}`));
});

test("an event logged while a flush is on the wire stays for the next flush", async () => {
  await events.log("before");
  let finish: (v: { error: null }) => void = () => {};
  mockInsert.mockReturnValueOnce(new Promise<{ error: null }>((r) => { finish = r; }));
  const f = events.flush();
  await new Promise<void>((r) => setImmediate(() => r()));
  await events.log("during");
  finish({ error: null });
  await f;
  expect((await queue()).map((e) => e.type)).toEqual(["during"]);
});

test("two flushes at once send once", async () => {
  await events.log("one");
  await Promise.all([events.flush(), events.flush()]);
  expect(mockInsert).toHaveBeenCalledTimes(1);
});

test("a failed flush keeps everything", async () => {
  await events.log("one");
  mockInsert.mockResolvedValue({ error: { message: "offline" } });
  await events.flush();
  expect(await queue()).toHaveLength(1);
});

test("logWith writes the event and the other key in the same single write", async () => {
  const spy = jest.spyOn(AsyncStorage, "multiSet");
  await events.logWith("frame", {}, "j1", [["other", "x"]]);
  expect(spy.mock.calls.some((c) => c[0].map((p) => p[0]).join() === "vaira.events.queue,other")).toBe(true);
  expect(await AsyncStorage.getItem("other")).toBe("x");
  expect(await queue()).toHaveLength(1);
});
