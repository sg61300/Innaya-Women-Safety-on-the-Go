import { decideRoute } from "../lib/route";

const T = "terms-v1";

test("new install, no stored language → language picker", () => {
  expect(decideRoute(false, null, null, T, false)).toBe("/(setup)/language");
});
test("no session but language already chosen → login", () => {
  expect(decideRoute(false, "en", null, T, false)).toBe("/(auth)/login");
});
test("session but profile language unset → language picker", () => {
  expect(decideRoute(true, "en", { name: "A" }, T, false)).toBe("/(setup)/language");
});
test("session, language set, no name → permissions", () => {
  expect(decideRoute(true, "en", { language: "en" }, T, false)).toBe("/(setup)/permissions");
});
test("a fully-consented user with no device words routes to safety-words", () => {
  // Terms + training consent done, then the device lost its emergency words
  // (reinstall / new device). A non-guardian must be sent back to set them.
  expect(
    decideRoute(
      true,
      "en",
      { language: "en", name: "A", terms_version: T, consent_c7_answered_at: "2026-01-01T00:00:00Z" },
      T,
      false
    )
  ).toBe("/(setup)/safety-words");
});
test("a guardian with no device words routes to trustees, not safety-words", () => {
  // A returning guardian on a fresh device has no local emergency words; the
  // words gate must not trap her — guardians go straight to trustees.
  expect(
    decideRoute(
      true,
      "en",
      { language: "en", name: "A", terms_version: T, consent_c7_answered_at: "2026-01-01T00:00:00Z", role_last_used: "guardian" },
      T,
      false
    )
  ).toBe("/(guardian)/trustees");
});
test("named but terms version stale → consent", () => {
  expect(decideRoute(true, "en", { language: "en", name: "A", terms_version: "old" }, T, true)).toBe(
    "/(setup)/consent"
  );
});
test("terms accepted but C7 training consent unanswered → training-consent", () => {
  expect(decideRoute(true, "en", { language: "en", name: "A", terms_version: T }, T, true)).toBe(
    "/(setup)/training-consent"
  );
});
test("guardian role → trustees", () => {
  expect(
    decideRoute(true, "en", { language: "en", name: "A", terms_version: T, consent_c7_answered_at: "2026-01-01T00:00:00Z", role_last_used: "guardian" }, T, true)
  ).toBe("/(guardian)/trustees");
});
test("user role with device words → home", () => {
  expect(
    decideRoute(true, "en", { language: "en", name: "A", terms_version: T, consent_c7_answered_at: "2026-01-01T00:00:00Z", role_last_used: "user" }, T, true)
  ).toBe("/(user)/home");
});

// ADR-043 rule 10: the emergency-password gate is retired — a user with device
// words reaches home directly; without device words she is sent to safety-words.
test("user role without device words → safety-words", () => {
  expect(
    decideRoute(true, "en", { language: "en", name: "A", terms_version: T, consent_c7_answered_at: "2026-01-01T00:00:00Z", role_last_used: "user" }, T, false)
  ).toBe("/(setup)/safety-words");
});

// The consent gate sits AFTER name/terms, so stale consent still lands on consent.
test("stale consent still wins over later gates", () => {
  expect(
    decideRoute(true, "en", { language: "en", name: "A", terms_version: "old", role_last_used: "user" }, T, true)
  ).toBe("/(setup)/consent");
});
