import { createHmac } from "crypto";

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
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (createHmac("sha256", secret()).update(payload).digest("base64url") !== sig) return null;
  try {
    const { j, c, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof j !== "string" || !(Date.now() < exp)) return null;
    return { journeyId: j, contactId: typeof c === "string" ? c : null };
  } catch {
    return null;
  }
}

// ADR-043: a per-guardian cancel-vote token, handed to exactly one guardian in
// their cancel-request link. It binds the vote to a (requestId, contactId) pair so
// the vote route can attribute and authorise the vote without a logged-in session;
// the journey status token above cannot (it is shared by every guardian). 30 min
// default TTL, matching the cancel-request window's generous upper bound.
export function signCancelVoteToken(requestId: string, contactId: string, ttlMs = 30 * 60_000): string {
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
