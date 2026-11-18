// Pure routing decision for the root index screen. Kept side-effect free so it
// can be unit-tested without a navigator or Supabase. Order matches Task 16,
// with the language gate added in Task 16b (ADR-018).
export type RouteProfile = {
  name?: string | null;
  terms_version?: string | null;
  consent_c7_answered_at?: string | null;
  role_last_used?: string | null;
  language?: string | null;
  tester_terms_accepted_at?: string | null;
} | null;

export function decideRoute(
  hasSession: boolean,
  storedLang: string | null,
  profile: RouteProfile,
  termsVersion: string,
  hasDeviceWords: boolean
): string {
  // New install with no chosen language picks one before signing up.
  if (!hasSession) return storedLang ? "/(auth)/login" : "/(setup)/language";
  if (!profile?.language) return "/(setup)/language";
  if (!profile?.name) return "/(setup)/permissions";
  if (profile.terms_version !== termsVersion) return "/(setup)/consent";
  if (!profile.consent_c7_answered_at) return "/(setup)/training-consent";
  // Guardians are checked before the device-words gate: a returning guardian on
  // a fresh device (no local emergency words) must reach trustees, not be trapped
  // at safety-words. Safety words are mandatory for the user path, so a
  // non-guardian is gated on the device-local flag before reaching home.
  if (profile.role_last_used === "guardian") return "/(guardian)/trustees";
  // ADR-043 rule 10: the emergency password is retired, so device safety words
  // are the only remaining user-path gate before home.
  if (!hasDeviceWords) return "/(setup)/safety-words";
  return "/(user)/home";
}
