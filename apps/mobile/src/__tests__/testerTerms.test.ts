import { testerTermsAccepted, TESTER_TERMS_VERSION } from "../lib/testerTerms";

// The gate is a pure version comparison so the re-prompt rule can be unit-tested
// without a navigator or storage.
test("the current version is accepted", () => {
  expect(testerTermsAccepted(TESTER_TERMS_VERSION)).toBe(true);
});

test("never accepted (no stored version) fails the gate", () => {
  expect(testerTermsAccepted(null)).toBe(false);
  expect(testerTermsAccepted(undefined)).toBe(false);
  expect(testerTermsAccepted("")).toBe(false);
});

test("a stale version re-prompts — bumping the string re-gates everyone", () => {
  expect(testerTermsAccepted("tester-terms-2020-01-01")).toBe(false);
});
