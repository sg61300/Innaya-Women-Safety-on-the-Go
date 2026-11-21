// Owner 2026-11-12 "fix all three": a request that hangs is cut off, so the outbox and every
// other caller can retry instead of waiting on the phone's own network timeout.
jest.mock("../lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } } }));

import { post, get, API_TIMEOUT_MS } from "../lib/api";

const hang = jest.fn((_u: string, opts: { signal?: AbortSignal }) =>
  new Promise((_res, rej) => opts.signal?.addEventListener("abort", () => rej(new Error("Aborted")))));

beforeEach(() => {
  (globalThis as unknown as { fetch: unknown }).fetch = hang;
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

test.each([
  ["post", () => post("/api/journey-state", {})],
  ["get", () => get("/api/monitoring")],
])("%s gives up after the time limit", async (_n, call) => {
  const p = call();
  const done = expect(p).rejects.toThrow();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  jest.advanceTimersByTime(API_TIMEOUT_MS);
  await done;
});
