import { supabase } from "../lib/supabase";
import { verifyAppPasswordLocal, storeAppPasswordHash } from "./appPassword";

// App password (ADR-043 cancel-flow step 1): an offline salted-hash check (R50),
// falling back to a live Supabase sign-in only when no local hash exists (proves
// the account owner). The ADR-014 emergency password is retired (ADR-043 rule 10).

// Pure lock decision from the two stored fields. Kept separate so the overlay can
// display "locked until" without re-implementing the +5-min rule.
export function lockState(p: { password_fail_count: number; locked_until: string | null }): { locked: boolean; until: Date | null } {
  const until = p.locked_until ? new Date(p.locked_until) : null;
  const locked = until !== null && until.getTime() > Date.now();
  return { locked, until };
}

// The gate-1 app-password result. `reason` lets the overlay show WHY (a real
// wrong password vs. a network/service failure) instead of a bare "Incorrect".
export type VerifyResult = { ok: true } | { ok: false; reason: "wrong" | "network" };

// App password = the account password. R50: check the local salted hash first —
// instant and offline, so a poor connection or an auth rate-limit can never trap a
// traveller in CRITICAL. Only when no local hash exists (e.g. signed up but never
// logged in through the login screen) do we fall back to the live sign-in proof.
async function verifyPassword(email: string, password: string): Promise<VerifyResult> {
  // H2 (Critical, b11): the local check must NEVER be able to block the live
  // check. On the field device it THREW at runtime (a SecureStore / expo-crypto
  // native call failing), and because it shared the live fallback's try/catch the
  // throw was swallowed as a plain rejection — so the live sign-in that would have
  // accepted the CORRECT password was never attempted (rejected online AND in
  // airplane, while a direct sign-in returned 200). Isolate it: a local HIT is
  // proof; a local miss (F2: stale after a reset) OR a throw both fall through.
  try {
    if ((await verifyAppPasswordLocal(password)) === true) return { ok: true };
  } catch (e) {
    console.warn("[gates] local check failed", (e as Error)?.message ?? String(e));
  }
  // J4: with no email (offline: getUser() failed AND no cached email) the live
  // sign-in below could only be called with "" and return 400 "Invalid login
  // credentials" — surfaced as a false "Incorrect." Treat a missing email as a
  // network condition ("Couldn't check your password…"), and never call sign-in.
  if (!email) {
    console.warn("[gates] no email for live sign-in — treating as offline");
    return { ok: false, reason: "network" };
  }
  // Live sign-in fallback. A network failure (airplane / poor signal / rate-limit /
  // 5xx) throws or returns a transport error; only an explicit invalid-credentials
  // answer is a real "wrong password". On success, refresh the offline hash.
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      try { await storeAppPasswordHash(password); } catch { /* refresh is best-effort; the sign-in already proved the owner */ }
      return { ok: true };
    }
    const wrong = /invalid login credentials/i.test(error.message ?? "");
    console.warn("[gates] live sign-in rejected", (error as { status?: number }).status ?? "?", error.message);
    return { ok: false, reason: wrong ? "wrong" : "network" };
  } catch (e) {
    console.warn("[gates] live sign-in threw (network?)", (e as Error)?.message ?? String(e));
    return { ok: false, reason: "network" };
  }
}

export const gates = { lockState, verifyPassword };
