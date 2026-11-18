// J4 (b12): in airplane mode the CRITICAL gate-1 rejected the correct app password.
// Two causes, both here:
//  (a) deviceSalt() → Crypto.getRandomBytes threw on device, so no salt and no
//      offline hash was ever stored (R50 inert) → the gate fell to a live sign-in
//      that could not run offline.
//  (b) the overlay's email came from supabase.auth.getUser(), which fails offline,
//      so the live sign-in was attempted with "" → 400 "Invalid login credentials"
//      → shown as "Incorrect."
//
// This suite proves: getRandomBytes throwing still stores a usable hash (async RNG
// fallback); resolveAccountEmail returns the cached email when getUser rejects; and
// gates.verifyPassword with an empty email returns reason "network" WITHOUT calling
// sign-in. expo-crypto is virtual-mocked because this worktree lacks it (main has it).
const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn((k: string) => Promise.resolve(mockStore.has(k) ? mockStore.get(k)! : null)),
  setItemAsync: jest.fn((k: string, v: string) => { mockStore.set(k, v); return Promise.resolve(); }),
}));
// (a) the sync native RNG throws (the field failure); the async RNG works, so the
// fallback must still produce a salt and therefore a stored hash.
jest.mock("expo-crypto", () => ({
  getRandomBytes: () => { throw new Error("native RNG unavailable"); },
  getRandomBytesAsync: async (n: number) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (i * 53 + 7) & 0xff; return a; },
  randomUUID: () => "00000000-0000-0000-0000-000000000000",
}), { virtual: true });
const mockSignIn = jest.fn();
const mockGetUser = jest.fn();
jest.mock("../lib/supabase", () => ({ supabase: { auth: { signInWithPassword: (...a: unknown[]) => mockSignIn(...a), getUser: (...a: unknown[]) => mockGetUser(...a) } } }));

import { deviceSalt, storeAppPasswordHash, verifyAppPasswordLocal, storeAccountEmail, resolveAccountEmail } from "../services/appPassword";
import { gates } from "../services/gates";

beforeEach(() => { mockStore.clear(); jest.clearAllMocks(); jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());

test("(a) getRandomBytes throws → a salt is still produced and the offline hash is stored + verifies", async () => {
  await storeAppPasswordHash("Correct-Horse-1");
  expect(mockStore.get("vaira.device_salt")).toBeTruthy();
  expect(mockStore.get("vaira.app_password_hash")).toBeTruthy();
  await expect(verifyAppPasswordLocal("Correct-Horse-1")).resolves.toBe(true);
  await expect(verifyAppPasswordLocal("wrong")).resolves.toBe(false);
  // plaintext never persisted
  for (const v of mockStore.values()) expect(v).not.toContain("Correct-Horse-1");
});

test("(a) deviceSalt still deterministic once stored, even though the sync RNG throws", async () => {
  const a = await deviceSalt();
  const b = await deviceSalt();
  expect(a).toBeTruthy();
  expect(a).toBe(b);
});

test("(b) getUser rejects → resolveAccountEmail returns the email cached at login", async () => {
  mockGetUser.mockRejectedValue(new Error("network"));
  await storeAccountEmail("user@example.com");
  await expect(resolveAccountEmail()).resolves.toBe("user@example.com");
  expect(mockGetUser).toHaveBeenCalled();
});

test("(b) getUser returns a live email → that email is used over the cache", async () => {
  mockGetUser.mockResolvedValue({ data: { user: { email: "live@example.com" } } });
  await storeAccountEmail("stale@example.com");
  await expect(resolveAccountEmail()).resolves.toBe("live@example.com");
});

test("(b/c) verifyPassword with empty email → reason 'network', sign-in NEVER called (no false 'Incorrect')", async () => {
  // no local hash stored → local check returns null → would fall to sign-in
  const r = await gates.verifyPassword("", "whatever");
  expect(r).toEqual({ ok: false, reason: "network" });
  expect(mockSignIn).not.toHaveBeenCalled();
});

test("(c) verifyPassword with a real email + no local hash → still attempts the live sign-in", async () => {
  mockSignIn.mockResolvedValue({ error: null });
  const r = await gates.verifyPassword("user@example.com", "pw");
  expect(mockSignIn).toHaveBeenCalledWith({ email: "user@example.com", password: "pw" });
  expect(r).toEqual({ ok: true });
});
