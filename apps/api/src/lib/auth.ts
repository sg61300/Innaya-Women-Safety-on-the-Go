import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { timingSafeEqual } from "crypto";

// Supabase signs session JWTs with an asymmetric ES256 key (Tasks/04 amendment 9):
// verify against the project JWKS, not a shared secret. `jwksOverride` lets tests
// inject a key pair without a network call.
type Jwks = JWTVerifyGetKey | Parameters<typeof jwtVerify>[1];

let cached: JWTVerifyGetKey | null = null;
function jwks(): JWTVerifyGetKey {
  if (!cached) {
    cached = createRemoteJWKSet(
      new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
    );
  }
  return cached;
}

export async function requireUser(
  req: Request,
  jwksOverride?: Jwks,
): Promise<{ id: string; email?: string }> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Response("unauthorized", { status: 401 });
  try {
    const { payload } = await jwtVerify(token, (jwksOverride ?? jwks()) as JWTVerifyGetKey, {
      issuer: `${process.env.SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
    });
    if (!payload.sub) throw new Error("no subject");
    // The Supabase access token carries the account email claim; /api/simulate-proof
    // sends the tester their own practice proof and needs it. Backward-compatible:
    // existing callers destructure only { id }.
    return { id: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined };
  } catch {
    throw new Response("unauthorized", { status: 401 });
  }
}

// Fail closed: an unset/empty CRON_SECRET must reject every request (otherwise a
// literal "Bearer undefined" would authenticate). Constant-time compare on
// equal-length buffers avoids leaking the secret through timing.
export function isCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  if (!header) return false;
  const got = Buffer.from(header);
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}
