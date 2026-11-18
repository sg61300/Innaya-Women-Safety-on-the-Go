import { signGuardianToken, verifyGuardianToken } from "@/lib/token";

test("per-contact token round-trips journey + contact and expires", () => {
  process.env.GUARDIAN_LINK_SECRET = "k";
  expect(verifyGuardianToken(signGuardianToken("j1", "c1"))).toEqual({ journeyId: "j1", contactId: "c1" });
  expect(verifyGuardianToken(signGuardianToken("j1", "c1", -1))).toBeNull();
  expect(verifyGuardianToken(signGuardianToken("j1", "c1") + "x")).toBeNull();
});

test("legacy journey-only token still verifies with a null contact", () => {
  process.env.GUARDIAN_LINK_SECRET = "k";
  expect(verifyGuardianToken(signGuardianToken("j1"))).toEqual({ journeyId: "j1", contactId: null });
  expect(verifyGuardianToken(signGuardianToken("j1", null, -1))).toBeNull();
});

test("a token signed with a different secret is rejected", () => {
  process.env.GUARDIAN_LINK_SECRET = "k1";
  const t = signGuardianToken("j2", "c2");
  process.env.GUARDIAN_LINK_SECRET = "k2";
  expect(verifyGuardianToken(t)).toBeNull();
});

test("malformed tokens return null, not throw", () => {
  process.env.GUARDIAN_LINK_SECRET = "k";
  expect(verifyGuardianToken("garbage")).toBeNull();
  expect(verifyGuardianToken("")).toBeNull();
  expect(verifyGuardianToken("a.b.c")).toBeNull();
});
