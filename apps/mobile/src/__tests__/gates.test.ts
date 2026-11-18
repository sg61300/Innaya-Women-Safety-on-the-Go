// Supabase is mocked so the gate logic can be exercised without a network or env.
// Two distinct `.eq` chains: reads end in `.maybeSingle()`, writes (update) resolve on `.eq()`.
const mockSignIn = jest.fn();
let selectResult: { data: unknown; error: unknown } = { data: null, error: null };
const mockUpdateEq = jest.fn().mockResolvedValue({ error: null });
const mockUpdate = jest.fn((..._a: any[]) => ({ eq: mockUpdateEq }));
const mockMaybeSingle = jest.fn(() => Promise.resolve(selectResult));
const mockSelectEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockSelectEq }));
const mockFrom = jest.fn((..._a: any[]) => ({ select: mockSelect, update: mockUpdate }));
jest.mock("../lib/supabase", () => ({
  supabase: { auth: { signInWithPassword: (...a: any[]) => mockSignIn(...a) }, from: (...a: any[]) => mockFrom(...a) },
}));

// R50: the offline local-hash check the gate consults first. Default = no local
// hash (null) so the existing sign-in tests still exercise the live path.
const mockVerifyLocal = jest.fn<Promise<boolean | null>, [string]>(() => Promise.resolve(null));
const mockStoreHash = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
jest.mock("../services/appPassword", () => ({
  verifyAppPasswordLocal: (p: string) => mockVerifyLocal(p),
  storeAppPasswordHash: (p: string) => mockStoreHash(p),
}));

import { gates, lockState } from "../services/gates";

beforeEach(() => {
  jest.clearAllMocks();
  selectResult = { data: null, error: null };
  mockUpdateEq.mockResolvedValue({ error: null });
  mockVerifyLocal.mockResolvedValue(null);
  mockStoreHash.mockResolvedValue(undefined);
});

describe("lockState", () => {
  test("no locked_until → not locked, until null", () => {
    expect(lockState({ password_fail_count: 0, locked_until: null })).toEqual({ locked: false, until: null });
  });
  test("locked_until in the past → not locked", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const r = lockState({ password_fail_count: 5, locked_until: past });
    expect(r.locked).toBe(false);
    expect(r.until?.toISOString()).toBe(past);
  });
  test("locked_until in the future → locked", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const r = lockState({ password_fail_count: 5, locked_until: future });
    expect(r.locked).toBe(true);
    expect(r.until?.toISOString()).toBe(future);
  });
});

describe("verifyPassword", () => {
  test("mockSignIn ok → ok", async () => {
    mockSignIn.mockResolvedValue({ error: null });
    await expect(gates.verifyPassword("a@b.c", "pw")).resolves.toEqual({ ok: true });
    expect(mockSignIn).toHaveBeenCalledWith({ email: "a@b.c", password: "pw" });
  });
  test("invalid credentials → not ok, reason wrong", async () => {
    mockSignIn.mockResolvedValue({ error: { status: 400, message: "Invalid login credentials" } });
    await expect(gates.verifyPassword("a@b.c", "wrong")).resolves.toEqual({ ok: false, reason: "wrong" });
  });

  // A non-credential live failure (rate-limit / 5xx / transport) is NOT a wrong
  // password — the traveller can retry, so the overlay shows a network message.
  test("live service error (429) → not ok, reason network", async () => {
    mockSignIn.mockResolvedValue({ error: { status: 429, message: "Too many requests" } });
    await expect(gates.verifyPassword("a@b.c", "pw")).resolves.toEqual({ ok: false, reason: "network" });
  });
  test("live sign-in throws (airplane) → not ok, reason network", async () => {
    mockSignIn.mockRejectedValue(new Error("Network request failed"));
    await expect(gates.verifyPassword("a@b.c", "pw")).resolves.toEqual({ ok: false, reason: "network" });
  });

  // R50: with a local hash present the gate is offline — it must NOT hit the network.
  test("local hash hit → ok and NO sign-in call", async () => {
    mockVerifyLocal.mockResolvedValue(true);
    await expect(gates.verifyPassword("a@b.c", "pw")).resolves.toEqual({ ok: true });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  // F2 (safety): a stale local hash (e.g. after a password reset) must NOT be the
  // final word. local !== true falls back to the live sign-in; on live success the
  // hash is refreshed so the new password works offline next time.
  test("local miss + live ok → ok and hash refreshed", async () => {
    mockVerifyLocal.mockResolvedValue(false);
    mockSignIn.mockResolvedValue({ error: null });
    await expect(gates.verifyPassword("a@b.c", "newpw")).resolves.toEqual({ ok: true });
    expect(mockSignIn).toHaveBeenCalledWith({ email: "a@b.c", password: "newpw" });
    expect(mockStoreHash).toHaveBeenCalledWith("newpw");
  });

  test("local miss + live wrong → not ok, no hash refresh", async () => {
    mockVerifyLocal.mockResolvedValue(false);
    mockSignIn.mockResolvedValue({ error: { status: 400, message: "Invalid login credentials" } });
    await expect(gates.verifyPassword("a@b.c", "wrong")).resolves.toEqual({ ok: false, reason: "wrong" });
    expect(mockStoreHash).not.toHaveBeenCalled();
  });

  test("no local hash → falls back to the live sign-in", async () => {
    mockVerifyLocal.mockResolvedValue(null);
    mockSignIn.mockResolvedValue({ error: null });
    await expect(gates.verifyPassword("a@b.c", "pw")).resolves.toEqual({ ok: true });
    expect(mockSignIn).toHaveBeenCalledWith({ email: "a@b.c", password: "pw" });
  });

  // H2 (Critical, b11): on the field device the local check THREW on device
  // (SecureStore / expo-crypto native call failing at runtime) and, because it sat
  // in the SAME try/catch as the live fallback, the throw was swallowed and the
  // live sign-in that would accept the correct password was NEVER attempted — the
  // gate rejected the correct password online AND in airplane, while a direct
  // sign-in returned 200. The local check must never be able to block the live one.
  test("H2: local check throws → still attempts the live sign-in (throw not swallowed)", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockVerifyLocal.mockRejectedValue(new Error("Cannot find native module 'ExpoCrypto'"));
    mockSignIn.mockResolvedValue({ error: null });
    await expect(gates.verifyPassword("a@b.c", "pw")).resolves.toEqual({ ok: true });
    expect(mockSignIn).toHaveBeenCalledWith({ email: "a@b.c", password: "pw" });
    expect(warn).toHaveBeenCalledWith("[gates] local check failed", "Cannot find native module 'ExpoCrypto'");
    warn.mockRestore();
  });
});
