// Fix lane D3-6 (founder Q117, Q118): offline photos.
import React from "react";
import { render, act, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockFiles: Record<string, string> = {};
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///app/",
  makeDirectoryAsync: jest.fn(async () => {}),
  writeAsStringAsync: jest.fn(async (p: string, d: string) => { mockFiles[p] = d; }),
  readAsStringAsync: jest.fn(async (p: string) => { if (!(p in mockFiles)) throw new Error("no file"); return mockFiles[p]; }),
  deleteAsync: jest.fn(async (p: string) => { delete mockFiles[p]; }),
}));
const mockUpload = jest.fn();
jest.mock("../../lib/supabase", () => ({ supabase: { storage: { from: () => ({ upload: (...a: unknown[]) => mockUpload(...a) }) }, from: () => ({ insert: async () => ({ error: null }) }) } }));
const mockLog = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/events", () => ({ events: {
  log: (...a: unknown[]) => mockLog(...a),
  // Same contract as the real one: the extra keys are written with the event, or neither.
  logWith: async (...a: any[]) => { await mockLog(...a); await require("@react-native-async-storage/async-storage").multiSet(a[3]); },
  flush: jest.fn().mockResolvedValue(undefined),
} }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

import { initialContext } from "@vaira/core";
import { frameQueue } from "../frameQueue";
import { useJourney } from "../../store/journey";
import { useSession } from "../../store/session";
import { ThemeProvider } from "../../theme";
import { PhotoCleanupPrompt } from "../../components/PhotoCleanupPrompt";

const B64 = "AAEC"; // 3 bytes
const onTrip = () => useJourney.setState({ ctx: { ...initialContext(), state: "CRITICAL" }, journey: { id: "j1" } });
const tripOver = () => useJourney.setState({ ctx: { ...initialContext(), state: "RESOLVED" }, journey: null });
const add = (ts: number) => frameQueue.add({ journeyId: "j1", path: `j1/${ts}.jpg`, ts, base64: B64, meta: { degraded: false } });
const paths = () => mockUpload.mock.calls.map((c) => c[0]);

beforeEach(async () => {
  await AsyncStorage.clear();
  for (const k of Object.keys(mockFiles)) delete mockFiles[k];
  mockUpload.mockReset();
  mockUpload.mockResolvedValue({ error: null });
  mockLog.mockClear();
  frameQueue.resetForTest();
  useSession.setState({ userId: "me" });
  onTrip();
  useJourney.setState({ photoCleanup: null });
});

test("saved on the phone, uploaded in capture order, once each, with its frame event", async () => {
  await add(300); await add(100); await add(200);
  expect(Object.keys(mockFiles)).toHaveLength(3);
  await frameQueue.drain();
  expect(paths()).toEqual(["j1/100.jpg", "j1/200.jpg", "j1/300.jpg"]);
  expect(mockUpload.mock.calls[0][1]).toEqual(new Uint8Array([0, 1, 2]));
  expect(mockLog.mock.calls.map((c) => c[0])).toEqual(["frame", "frame", "frame"]);
  expect(mockLog.mock.calls[0][1]).toMatchObject({ path: "j1/100.jpg", captured_at: new Date(100).toISOString(), offline: true });
  mockUpload.mockClear();
  await frameQueue.drain();
  expect(mockUpload).not.toHaveBeenCalled();
});

test("still offline: stops at the first failure, keeps order and everything for the next try", async () => {
  await add(100); await add(200);
  mockUpload.mockResolvedValueOnce({ error: { message: "Network request failed" } });
  await frameQueue.drain();
  expect(paths()).toEqual(["j1/100.jpg"]);
  expect(await frameQueue.counts()).toEqual({ pending: 2, uploaded: 0 });
  mockUpload.mockClear();
  await frameQueue.drain();
  expect(paths()).toEqual(["j1/100.jpg", "j1/200.jpg"]);
});

test("killed after the upload and before marking: the storage duplicate counts as uploaded, no second object", async () => {
  await add(100);
  mockUpload.mockResolvedValueOnce({ error: { statusCode: "409", message: "The resource already exists" } });
  await frameQueue.drain();
  expect(await frameQueue.counts()).toEqual({ pending: 0, uploaded: 1 });
  expect(mockLog).toHaveBeenCalledTimes(1);
});

test("two drains at once upload once", async () => {
  await add(100);
  await Promise.all([frameQueue.drain(), frameQueue.drain()]);
  expect(mockUpload).toHaveBeenCalledTimes(1);
});

test("a refused upload is not marked uploaded and is never offered", async () => {
  await add(100);
  mockUpload.mockResolvedValue({ error: { statusCode: "404", message: "denied" } });
  await frameQueue.drain();
  tripOver();
  await frameQueue.offerCleanup();
  expect(useJourney.getState().photoCleanup).toBeNull();
});

test("a file gone from the phone does not block the rest", async () => {
  await add(100); await add(200);
  delete mockFiles["file:///app/frame-queue/j1_100.jpg"];
  await frameQueue.drain();
  expect(paths()).toEqual(["j1/200.jpg"]);
  expect(await frameQueue.counts()).toEqual({ pending: 0, uploaded: 1 });
});

test("never asked during the trip; after it, only uploaded copies; Delete removes only those", async () => {
  await add(100); await add(200);
  mockUpload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "offline" } });
  await frameQueue.drain();
  await frameQueue.offerCleanup();
  expect(useJourney.getState().photoCleanup).toBeNull(); // trip still on
  tripOver();
  await frameQueue.offerCleanup();
  expect(useJourney.getState().photoCleanup).toBe(1);
  await frameQueue.deleteUploaded();
  expect(useJourney.getState().photoCleanup).toBeNull();
  expect(Object.keys(mockFiles)).toEqual(["file:///app/frame-queue/j1_200.jpg"]);
  expect(await frameQueue.counts()).toEqual({ pending: 1, uploaded: 0 });
  expect(mockUpload.mock.calls.length).toBe(2); // deleting never re-uploads
});

test("the last upload finishing after the trip raises the question", async () => {
  await add(100);
  tripOver();
  await frameQueue.drain();
  expect(useJourney.getState().photoCleanup).toBe(1);
});

test("the card: Delete and Keep; Keep does not ask again until the next trip ends", async () => {
  await add(100);
  await frameQueue.drain();
  tripOver();
  const el = await render(<ThemeProvider><PhotoCleanupPrompt /></ThemeProvider>);
  await act(async () => { await frameQueue.offerCleanup(); });
  expect(el.getByTestId("photo-cleanup-title")).toHaveTextContent("Delete saved photos?");
  // Fix lane D6 (founder Q127): the after-trip prompt also says photos are kept 30 days.
  expect(el.getByTestId("photo-retention")).toHaveTextContent(/kept for 30 days/);
  await act(async () => { fireEvent.press(el.getByTestId("photo-cleanup-keep")); });
  expect(el.queryByTestId("photo-cleanup-title")).toBeNull();
  await act(async () => { await frameQueue.offerCleanup(); });
  expect(el.queryByTestId("photo-cleanup-title")).toBeNull();
  expect(Object.keys(mockFiles)).toHaveLength(1);
  await act(async () => { onTrip(); });
  await act(async () => { tripOver(); });
  await act(async () => { await frameQueue.offerCleanup(); });
  await act(async () => { fireEvent.press(el.getByTestId("photo-cleanup-delete")); });
  expect(Object.keys(mockFiles)).toHaveLength(0);
});

test("T26 Keep: not asked again for 5 days, even after a restart; asked again at 5 days; only uploaded copies", async () => {
  const t0 = Date.parse("2026-11-13T10:00:00Z");
  const now = jest.spyOn(Date, "now").mockReturnValue(t0);
  try {
    await add(100); await add(200);
    mockUpload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "offline" } });
    await frameQueue.drain();
    tripOver();
    await frameQueue.offerCleanup();
    expect(useJourney.getState().photoCleanup).toBe(1); // the uploaded one only
    frameQueue.keep();
    await new Promise((r) => setTimeout(r, 0));
    frameQueue.resetForTest(); // app restart
    now.mockReturnValue(t0 + 4 * 24 * 3600_000);
    await frameQueue.offerCleanup();
    expect(useJourney.getState().photoCleanup).toBeNull();
    now.mockReturnValue(t0 + 5 * 24 * 3600_000);
    await frameQueue.offerCleanup();
    expect(useJourney.getState().photoCleanup).toBe(1); // still never the photo not yet uploaded
  } finally {
    now.mockRestore();
  }
});

describe("D4", () => {
  test("M7 a refused photo does not block later ones; retried; after 5 refusals deleted and logged", async () => {
    await add(100); await add(200);
    mockUpload.mockImplementation(async (p: string) => (p === "j1/100.jpg" ? { error: { statusCode: 404, message: "denied" } } : { error: null }));
    for (let i = 0; i < 4; i++) await frameQueue.drain();
    expect(await frameQueue.counts()).toEqual({ pending: 1, uploaded: 1 });
    expect(mockFiles["file:///app/frame-queue/j1_100.jpg"]).toBeTruthy();
    await frameQueue.drain();
    expect(await frameQueue.counts()).toEqual({ pending: 0, uploaded: 1 });
    expect(mockFiles["file:///app/frame-queue/j1_100.jpg"]).toBeUndefined();
    expect(mockLog.mock.calls.find((c) => c[0] === "frame_refused_dropped")?.[1]).toMatchObject({ path: "j1/100.jpg", refused: 5 });
  });

  test("M7 too large: dropped at once", async () => {
    await add(100); await add(200);
    mockUpload.mockImplementation(async (p: string) => (p === "j1/100.jpg" ? { error: { statusCode: 413, message: "too big" } } : { error: null }));
    await frameQueue.drain();
    expect(await frameQueue.counts()).toEqual({ pending: 0, uploaded: 1 });
  });

  test("M7 a rate limit or server error is not a refusal: it waits, in order", async () => {
    await add(100); await add(200);
    mockUpload.mockResolvedValue({ error: { statusCode: 429, message: "slow down" } });
    await frameQueue.drain();
    expect(paths()).toEqual(["j1/100.jpg"]);
    expect(await frameQueue.counts()).toEqual({ pending: 2, uploaded: 0 });
  });

  // F5 (founder decision 5): a lapsed/missing sign-in (401/403) is not a refusal. The photo waits
  // and uploads after she signs in again; it is never counted toward REFUSED_LIMIT or dropped.
  test("T20 sign-in lapses during upload (401/403): the photo is kept, not refused, uploads after sign-in", async () => {
    await add(100); await add(200);
    mockUpload.mockResolvedValue({ error: { statusCode: 401, message: "jwt expired" } });
    await frameQueue.drain();
    expect(paths()).toEqual(["j1/100.jpg"]); // tried the oldest, stopped there (no refusal)
    expect(await frameQueue.counts()).toEqual({ pending: 2, uploaded: 0 }); // both kept, none dropped
    // Even after many attempts a 403 is never counted as a refusal (contrast REFUSED_LIMIT = 5).
    mockUpload.mockResolvedValue({ error: { statusCode: 403, message: "forbidden" } });
    for (let i = 0; i < 6; i++) await frameQueue.drain();
    expect(await frameQueue.counts()).toEqual({ pending: 2, uploaded: 0 });
    expect(mockFiles["file:///app/frame-queue/j1_100.jpg"]).toBeTruthy();
    // She signs in again: the server now accepts, both upload oldest-first, once each.
    mockUpload.mockReset();
    mockUpload.mockResolvedValue({ error: null });
    await frameQueue.drain();
    expect(paths()).toEqual(["j1/100.jpg", "j1/200.jpg"]);
    expect(await frameQueue.counts()).toEqual({ pending: 0, uploaded: 2 });
  });

  test("M7 another account's photos are not uploaded, counted or offered", async () => {
    await add(100);
    await frameQueue.drain();
    tripOver();
    useJourney.setState({ photoCleanup: null });
    await add(200); // the first account's, not yet sent
    useSession.setState({ userId: "someone-else" });
    mockUpload.mockClear();
    await frameQueue.drain();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(await frameQueue.counts()).toEqual({ pending: 0, uploaded: 0 });
    expect(useJourney.getState().photoCleanup).toBeNull();
    await frameQueue.deleteUploaded();
    expect(Object.keys(mockFiles)).toHaveLength(2); // hers are not deleted by someone else either
  });

  test("M7 signed out: nothing is uploaded", async () => {
    await add(100);
    useSession.setState({ userId: null });
    await frameQueue.drain();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  test("Q126 sign-out keeps photos not yet uploaded and removes uploaded ones", async () => {
    await add(100); await add(200); await add(300);
    mockUpload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "Network request failed" } });
    await frameQueue.drain();
    expect(await frameQueue.counts()).toEqual({ pending: 2, uploaded: 1 });
    await frameQueue.signOut();
    expect(Object.keys(mockFiles).sort()).toEqual(["file:///app/frame-queue/j1_200.jpg", "file:///app/frame-queue/j1_300.jpg"]);
    expect(JSON.parse((await AsyncStorage.getItem("vaira.frameQueue")) ?? "[]").map((i: { path: string }) => i.path)).toEqual(["j1/200.jpg", "j1/300.jpg"]);
    expect(useJourney.getState().photoCleanup).toBeNull();
  });

  test("Q126 after sign-out: another account uploads, counts and is offered nothing; she signs in again: uploaded in order, once", async () => {
    await add(300); await add(100); await add(200);
    useSession.setState({ userId: null });
    await frameQueue.signOut();
    tripOver();
    useSession.setState({ userId: "someone-else" });
    await frameQueue.drain();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(await frameQueue.counts()).toEqual({ pending: 0, uploaded: 0 });
    expect(useJourney.getState().photoCleanup).toBeNull();
    await frameQueue.signOut(); // the other account signs out: hers still stay
    expect(Object.keys(mockFiles)).toHaveLength(3);
    useSession.setState({ userId: "me" });
    await frameQueue.drain();
    expect(paths()).toEqual(["j1/100.jpg", "j1/200.jpg", "j1/300.jpg"]);
    await frameQueue.drain();
    expect(mockUpload).toHaveBeenCalledTimes(3);
    expect(mockLog.mock.calls.filter((c) => c[0] === "frame")).toHaveLength(3);
  });

  test("ChatGPT 10 killed after the upload, before the event and mark: on restart one frame event, no second", async () => {
    await add(100);
    mockLog.mockRejectedValueOnce(new Error("killed"));
    await frameQueue.drain();
    expect((await frameQueue.counts()).pending).toBe(1);
    mockLog.mockClear();
    mockUpload.mockResolvedValue({ error: { statusCode: 409, message: "already exists" } });
    await frameQueue.drain();
    await frameQueue.drain();
    expect(mockLog.mock.calls.filter((c) => c[0] === "frame")).toHaveLength(1);
    expect(await frameQueue.counts()).toEqual({ pending: 0, uploaded: 1 });
  });

  test("Low a copy that will not delete stays listed, offered again, never orphaned", async () => {
    await add(100);
    await frameQueue.drain();
    tripOver();
    const FS = require("expo-file-system/legacy");
    FS.deleteAsync.mockRejectedValueOnce(new Error("locked"));
    await frameQueue.deleteUploaded();
    expect((await frameQueue.counts()).uploaded).toBe(1);
    await frameQueue.deleteUploaded();
    expect((await frameQueue.counts()).uploaded).toBe(0);
    expect(Object.keys(mockFiles)).toHaveLength(0);
  });

  test("Low a save that fails half way leaves no file behind", async () => {
    const spy = jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("disk full"));
    await add(100);
    spy.mockRestore();
    expect(Object.keys(mockFiles)).toHaveLength(0);
  });
});
