// Model providers that score journey frames (V12 "Who scores your frames" card).
// Source of truth is the SCORER_PROVIDERS env in apps/api; the mobile list is
// read from GET /api/health `providers` when reachable, else this fallback.
// Terms links are curated here because /api/health returns names only.
export type Provider = { name: string; terms: string };

export const PROVIDERS: Provider[] = [
  { name: "Mistral", terms: "https://mistral.ai/terms" },
  { name: "Groq", terms: "https://groq.com/terms-of-use" },
  { name: "Gemini", terms: "https://ai.google.dev/gemini-api/terms" },
];

// Match a name reported by /api/health to a curated entry (case-insensitive),
// so an unknown/typo'd provider name is simply dropped rather than shown linkless.
export function providerFor(name: string): Provider | undefined {
  return PROVIDERS.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
}
