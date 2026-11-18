import { createHmac } from "crypto";
import { CANCEL_GROUP_WINDOW_MS, CANCEL_LATE_SAFE_MS } from "@vaira/core";

// Signed, self-contained guardian link token (Task 12/14). No DB row: the payload
// carries the journey id + expiry, the HMAC (GUARDIAN_LINK_SECRET) makes it
// unforgeable. base64url so it is URL-safe.
const secret = () => process.env.GUARDIAN_LINK_SECRET!;

// ADR-043 (s23 I10): the token may also carry the recipient guardian's contactId
// so the per-guardian link can vote on an open cancel request without the
// `?cr&vt` query params. `contactId` is optional: a journey-only token (every
// link sent before I10) still verifies and simply resolves to `contactId: null`.
export function signGuardianToken(journeyId: string, contactId: string | null = null, ttlMs = 24 * 3600_000): string {
  const body: Record<string, unknown> = { j: journeyId, exp: Date.now() + ttlMs };
  if (contactId) body.c = contactId;
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}

export function verifyGuardianToken(token: string): { journeyId: string; contactId: string | null } | null {
  const v = verifyGuardianTokenAnyAge(token);
  return v && !v.expired ? { journeyId: v.journeyId, contactId: v.contactId } : null;
}

// Fix lane D5 (brief item 7): the signature alone, with whether the 24 h life is over. Only the
// guardian end action uses an expired link, and only while an emergency-word alarm is live.
export function verifyGuardianTokenAnyAge(token: string): { journeyId: string; contactId: string | null; expired: boolean } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (createHmac("sha256", secret()).update(payload).digest("base64url") !== sig) return null;
  try {
    const { j, c, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof j !== "string" || typeof exp !== "number") return null;
    return { journeyId: j, contactId: typeof c === "string" ? c : null, expired: !(Date.now() < exp) };
  } catch {
    return null;
  }
}

// ADR-043: a per-guardian cancel-vote token, handed to exactly one guardian in
// their cancel-request link. It binds the vote to a (requestId, contactId) pair so
// the vote route can attribute and authorise the vote without a logged-in session;
// the journey status token above cannot (it is shared by every guardian). The default
// TTL is the life of a Safe (window + 5 min, cancelSafeOpen), so a link never dies first.
export function signCancelVoteToken(requestId: string, contactId: string, ttlMs = CANCEL_GROUP_WINDOW_MS + CANCEL_LATE_SAFE_MS): string {
  const payload = Buffer.from(JSON.stringify({ r: requestId, c: contactId, exp: Date.now() + ttlMs })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}

export function verifyCancelVoteToken(token: string): { requestId: string; contactId: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (createHmac("sha256", secret()).update(payload).digest("base64url") !== sig) return null;
  try {
    const { r, c, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof r === "string" && typeof c === "string" && Date.now() < exp ? { requestId: r, contactId: c } : null;
  } catch {
    return null;
  }
}
