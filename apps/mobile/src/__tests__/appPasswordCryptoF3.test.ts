// F3 (Critical, same class as G1): the device salt must be generated with a
// Hermes-safe source. @noble's randomBytes needs globalThis.crypto.getRandomValues,
// which Expo 57's winter runtime does NOT install — so on the device it threw on
// every login and R50 was silently inert. This test runs WITHOUT globalThis.crypto
// (device-shaped) and proves the salt/hash are still produced via expo-crypto.

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn((k: string) => Promise.resolve(mockStore.has(k) ? mockStore.get(k)! : null)),
  setItemAsync: jest.fn((k: string, v: string) => { mockStore.set(k, v); return Promise.resolve(); }),
}));

// Mock expo-crypto shaped like the native module: getRandomBytes(n) → Uint8Array(n).
jest.mock("expo-crypto", () => ({
  getRandomBytes: (n: number) => {
    const a = new Uint8Array(n);
    for (let i = 0; i < n; i++) a[i] = (i * 37 + 11) & 0xff;
    return a;
  },
}));

import { deviceSalt, storeAppPasswordHash, verifyAppPasswordLocal } from "../services/appPassword";

const origCrypto = (globalThis as any).crypto;
beforeAll(() => { (globalThis as any).crypto = undefined; }); // Hermes/winter: no WebCrypto
afterAll(() => { (globalThis as any).crypto = origCrypto; });
beforeEach(() => mockStore.clear());

test("salt + hash are produced without globalThis.crypto (device-shaped)", async () => {
  await storeAppPasswordHash("Vaira-b5-test-2026");
  const salt = await deviceSalt();
  expect(salt).toMatch(/^[0-9a-f]{32}$/); // 16 random bytes → 32 hex chars
  expect(mockStore.get("vaira.app_password_hash")).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  await expect(verifyAppPasswordLocal("Vaira-b5-test-2026")).resolves.toBe(true);
});
