import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from "jose";
import { requireUser, isCron } from "@/lib/auth";

process.env.SUPABASE_URL = "https://proj.supabase.co";
const ISS = "https://proj.supabase.co/auth/v1";

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  jwk.alg = "ES256";
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown>, aud = "authenticated", iss = ISS) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256" })
      .setIssuer(iss)
      .setAudience(aud)
      .setExpirationTime("1h")
      .sign(privateKey);
  return { jwks, sign };
}

const bearer = (t: string) => new Request("http://x", { headers: { authorization: `Bearer ${t}` } });

// The caught rejection must be a Response with status 401 (F3).
async function expectRejects401(p: Promise<unknown>) {
  const err = await p.then(() => null).catch((e) => e);
  expect(err).toBeInstanceOf(Response);
  expect((err as Response).status).toBe(401);
}

test("valid ES256 token returns the subject id", async () => {
  const { jwks, sign } = await setup();
  const token = await sign({ sub: "user-123" });
  await expect(requireUser(bearer(token), jwks)).resolves.toEqual({ id: "user-123" });
});

test("missing Authorization header is rejected 401", async () => {
  const { jwks } = await setup();
  await expectRejects401(requireUser(new Request("http://x"), jwks));
});

test("wrong audience is rejected 401", async () => {
  const { jwks, sign } = await setup();
  const token = await sign({ sub: "u" }, "anon");
  await expectRejects401(requireUser(bearer(token), jwks));
});

test("wrong issuer is rejected 401", async () => {
  const { jwks, sign } = await setup();
  const token = await sign({ sub: "u" }, "authenticated", "https://evil.example/auth/v1");
  await expectRejects401(requireUser(bearer(token), jwks));
});

// F1: isCron must fail closed when CRON_SECRET is unset/empty.
describe("isCron", () => {
  const cronReq = (auth?: string) =>
    new Request("http://x", auth ? { headers: { authorization: auth } } : undefined);

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  test("unset secret rejects even a literal 'Bearer undefined'", () => {
    delete process.env.CRON_SECRET;
    expect(isCron(cronReq("Bearer undefined"))).toBe(false);
    expect(isCron(cronReq())).toBe(false);
  });

  test("empty secret rejects", () => {
    process.env.CRON_SECRET = "";
    expect(isCron(cronReq("Bearer "))).toBe(false);
  });

  test("correct secret is accepted", () => {
    process.env.CRON_SECRET = "s3cr3t";
    expect(isCron(cronReq("Bearer s3cr3t"))).toBe(true);
  });

  test("wrong secret is rejected", () => {
    process.env.CRON_SECRET = "s3cr3t";
    expect(isCron(cronReq("Bearer nope"))).toBe(false);
    expect(isCron(cronReq("Bearer s3cr3tX"))).toBe(false);
  });
});
