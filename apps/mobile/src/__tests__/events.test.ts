jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// Prefixed `mock` so jest's out-of-scope guard allows it inside the jest.mock factory.
const mockInsert = jest.fn().mockResolvedValue({ error: null });
jest.mock("../lib/supabase", () => ({ supabase: { from: () => ({ insert: mockInsert }) } }));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { events } from "../lib/events";
import { useSession } from "../store/session";

beforeEach(async () => {
  mockInsert.mockReset();
  mockInsert.mockResolvedValue({ error: null });
  await AsyncStorage.clear();
  useSession.getState().set({ userId: null });
});

test("stamps the signed-in user_id on every event (per-user metrics attribution)", async () => {
  useSession.getState().set({ userId: "user-42" });
  await events.log("regions_opened", {});
  await events.log("golive_started", {}, null);
  await events.flush();
  const rows = mockInsert.mock.calls[0][0];
  expect(rows.map((r: any) => r.user_id)).toEqual(["user-42", "user-42"]);
  expect(rows[0].journey_id).toBeNull();
});

test("user_id is null when signed out", async () => {
  await events.log("products_opened", {});
  await events.flush();
  expect(mockInsert.mock.calls[0][0][0].user_id).toBeNull();
});

test("queued events flush in order and clear", async () => {
  await events.log("frame", { n: 1 }, "j1");
  await events.log("keyword", { w: "help" }, "j1");
  await events.flush();
  expect(mockInsert).toHaveBeenCalledTimes(1);
  expect(mockInsert.mock.calls[0][0].map((r: any) => r.type)).toEqual(["frame", "keyword"]);
  await events.flush();
  expect(mockInsert).toHaveBeenCalledTimes(1);
});

test("flush keeps the queue when insert returns an error", async () => {
  mockInsert.mockResolvedValueOnce({ error: { message: "boom" } });
  await events.log("frame", { n: 1 }, "j1");
  await events.flush();
  expect(mockInsert).toHaveBeenCalledTimes(1);
  // queue retained: a subsequent successful flush resends the same rows
  await events.flush();
  expect(mockInsert).toHaveBeenCalledTimes(2);
  expect(mockInsert.mock.calls[1][0].map((r: any) => r.type)).toEqual(["frame"]);
});
