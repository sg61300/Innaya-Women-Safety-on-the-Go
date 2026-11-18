import { hashSecret } from "@vaira/core";

// In-memory SecureStore so the offline app-password gate can be exercised without
// a device keystore. Each test controls what is already stored.
const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn((k: string) => Promise.resolve(mockStore.has(k) ? mockStore.get(k)! : null)),
  setItemAsync: jest.fn((k: string, v: string) => { mockStore.set(k, v); return Promise.resolve(); }),
}));
// Native-shaped expo-crypto: getRandomBytes(n) → Uint8Array(n).
jest.mock("expo-crypto", () => ({
  getRandomBytes: (n: number) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (i * 37 + 11) & 0xff; return a; },
}));

import { deviceSalt, storeAppPasswordHash, verifyAppPasswordLocal } from "../services/appPassword";

beforeEach(() => { mockStore.clear(); jest.clearAllMocks(); });

test("deviceSalt is generated once and reused", async () => {
  const a = await deviceSalt();
  const b = await deviceSalt();
  expect(a).toBeTruthy();
  expect(a).toBe(b);
});

test("no local hash → verify returns null (caller falls back to live sign-in)", async () => {
  await expect(verifyAppPasswordLocal("anything")).resolves.toBeNull();
});

test("correct password offline → true, no plaintext stored", async () => {
  await storeAppPasswordHash("Correct-Horse-1");
  await expect(verifyAppPasswordLocal("Correct-Horse-1")).resolves.toBe(true);
  // the plaintext must never be persisted
  for (const v of mockStore.values()) expect(v).not.toContain("Correct-Horse-1");
});

test("wrong password offline → false", async () => {
  await storeAppPasswordHash("Correct-Horse-1");
  await expect(verifyAppPasswordLocal("wrong")).resolves.toBe(false);
});

// F1 (security): the app password must match EXACTLY. hashWord normalises
// (lowercase, strips punctuation) so it accepted any case/punctuation variant —
// weaker than the live sign-in it replaces. hashSecret hashes the raw string.
test("F1: only the exact secret verifies — case/punctuation variants fail", async () => {
  await storeAppPasswordHash("Vaira-b5-test-2026");
  await expect(verifyAppPasswordLocal("Vaira-b5-test-2026")).resolves.toBe(true);
  await expect(verifyAppPasswordLocal("vaira-b5-test-2026")).resolves.toBe(false);
  await expect(verifyAppPasswordLocal("vairab5test2026")).resolves.toBe(false);
});

test("stored hash is the raw salted hashSecret, not a bare hash of the password", async () => {
  await storeAppPasswordHash("Correct-Horse-1");
  const salt = await deviceSalt();
  const stored = mockStore.get("vaira.app_password_hash");
  expect(stored).toBe(hashSecret("Correct-Horse-1", salt));
});
