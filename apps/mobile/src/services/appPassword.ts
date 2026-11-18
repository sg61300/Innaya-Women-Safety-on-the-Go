import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { bytesToHex } from "@noble/hashes/utils";
import { hashSecret } from "@vaira/core";

// R50: the CRITICAL cancel first gate must not depend on a live sign-in (network
// sign-in as the sole CRITICAL exit fails under poor connectivity / auth
// rate-limit — the real defect G2). At login we store a salted hash of the
// account password here so the gate can verify it offline. Plaintext is never
// stored; the salt is per-install so the hash is not a bare sha256 of the password.
const SALT_KEY = "vaira.device_salt";
const HASH_KEY = "vaira.app_password_hash";
const EMAIL_KEY = "vaira.account_email";

// J4: 16 random bytes for the per-install salt, with graceful degradation. On some
// devices Crypto.getRandomBytes threw (native RNG unavailable), so no salt — and
// therefore no offline hash — was ever stored and R50 was inert (a correct
// password read as "Incorrect." in airplane mode). Try the sync native RNG, then
// the async native RNG, then randomUUID-derived bytes, and only as a last resort
// Math.random. A salt is ALWAYS produced. Logs which source was used.
async function saltBytes(): Promise<{ bytes: Uint8Array; source: string }> {
  try {
    return { bytes: Crypto.getRandomBytes(16), source: "getRandomBytes" };
  } catch { /* native sync RNG unavailable — try async */ }
  try {
    return { bytes: await Crypto.getRandomBytesAsync(16), source: "getRandomBytesAsync" };
  } catch { /* async RNG unavailable — derive from a UUID */ }
  try {
    const hex = Crypto.randomUUID().replace(/-/g, ""); // 32 hex chars → 16 bytes
    const a = new Uint8Array(16);
    for (let i = 0; i < 16; i++) a[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return { bytes: a, source: "randomUUID" };
  } catch { /* even randomUUID unavailable — last resort */ }
  const a = new Uint8Array(16);
  for (let i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256);
  return { bytes: a, source: "math_random" };
}

// Get-or-create the per-install salt. Generated once, then reused.
export async function deviceSalt(): Promise<string> {
  const existing = await SecureStore.getItemAsync(SALT_KEY);
  if (existing) return existing;
  const { bytes, source } = await saltBytes();
  console.warn(`[appPassword] salt source: ${source}`);
  const salt = bytesToHex(bytes); // 128 bits → 32 hex chars
  await SecureStore.setItemAsync(SALT_KEY, salt);
  return salt;
}

// Store (or refresh, on re-login) the salted hash of the app password. J4: the
// whole store is wrapped so a keystore failure is logged, never silent — the salt
// itself can no longer be the failure (saltBytes always yields one).
export async function storeAppPasswordHash(password: string): Promise<void> {
  try {
    const salt = await deviceSalt();
    await SecureStore.setItemAsync(HASH_KEY, hashSecret(password, salt));
  } catch (e) {
    console.warn("[appPassword] store failed", (e as Error)?.message ?? String(e));
    throw e;
  }
}

// J4: cache the account email at login so the CRITICAL gate can attempt the live
// sign-in fallback offline (when supabase.auth.getUser() cannot reach the server).
export async function storeAccountEmail(email: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(EMAIL_KEY, email);
  } catch (e) {
    console.warn("[appPassword] email store failed", (e as Error)?.message ?? String(e));
  }
}

// The account email for the gate: the live session's email when reachable, else
// the value cached at login. "" only when neither is available.
export async function resolveAccountEmail(): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require("../lib/supabase");
    const { data } = await supabase.auth.getUser();
    const email = data?.user?.email as string | undefined;
    if (email) return email;
  } catch { /* offline / no session — fall back to the cached email */ }
  return (await SecureStore.getItemAsync(EMAIL_KEY).catch(() => null)) ?? "";
}

// The offline check for the CRITICAL cancel first gate.
//   true / false — a local hash exists and (mis)matched, no network touched.
//   null          — no local hash; the caller falls back to the live sign-in.
export async function verifyAppPasswordLocal(password: string): Promise<boolean | null> {
  const stored = await SecureStore.getItemAsync(HASH_KEY);
  if (!stored) return null;
  const salt = await deviceSalt();
  return hashSecret(password, salt) === stored;
}

// F5: true when a local app-password hash exists — i.e. the account has a
// password we can verify offline. The Profile gate uses this to decide whether
// to challenge on entry; with no local hash (fresh install / not yet logged in)
// forcing a live sign-in on every Profile open would be hostile, so it does not
// gate. Any SecureStore failure is treated as "no password" so the gate can
// never lock the owner out of their own Profile.
export async function hasAppPassword(): Promise<boolean> {
  try {
    return !!(await SecureStore.getItemAsync(HASH_KEY));
  } catch {
    return false;
  }
}
