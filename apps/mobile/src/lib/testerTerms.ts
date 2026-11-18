// Tester-terms gate (founder ruling 2026-09-24): the MVP is open-tested by
// anyone via the public APK QR, and every tester must see and accept the tester
// terms before using the app. Kept side-effect free so the re-prompt decision is
// unit-testable without a navigator or storage.

// Bump this string to re-prompt everyone (a stored version that no longer equals
// this value fails the gate below and the screen is shown again).
export const TESTER_TERMS_VERSION = "tester-terms-2026-09-24";

// Full terms live on the site; the in-app screen links out to them.
export const TESTER_TERMS_URL = process.env.EXPO_PUBLIC_TESTER_TERMS_URL ?? "https://innaya-products.example.com/tester-terms";

// Device-local keys. The ISO date mirrors the server column and is kept for the
// record; the version key drives the re-prompt decision.
export const TESTER_TERMS_ACCEPTED_AT_KEY = "vaira.testerTermsAccepted";
export const TESTER_TERMS_VERSION_KEY = "vaira.testerTermsVersion";

// Pure: has this device already accepted the CURRENT tester-terms version?
export function testerTermsAccepted(storedVersion: string | null | undefined): boolean {
  return storedVersion === TESTER_TERMS_VERSION;
}
