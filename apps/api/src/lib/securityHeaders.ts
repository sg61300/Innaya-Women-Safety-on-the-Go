// Robots scoping (founder ruling 2026-09-24 campaign; replaces the earlier
// blanket block). The public campaign page "/" and the products site "/products*"
// are indexable with OG/Twitter cards. Everything else stays out of search: the
// per-path X-Robots-Tag header below (via next.config headers()), plus
// public/robots.txt and per-page <meta name="robots"> are the three layers.
// Kept in its own module so the header rules are unit-testable without importing
// next.config.
export const ROBOTS_TAG = "noindex, nofollow, noarchive";

export type HeaderRule = { source: string; headers: { key: string; value: string }[] };

// Paths that must NOT be indexed. "/" and "/products*" are deliberately absent so
// they carry no X-Robots-Tag and remain indexable. Order does not matter — Next
// applies every matching rule; only these prefixes match, so the public pages are
// never tagged.
export const NOINDEX_SOURCES = [
  "/api/:path*",
  "/g/:path*",
  "/download/:path*",
  "/tester-terms",
  "/tester-terms/:path*",
];

export function securityHeaders(): HeaderRule[] {
  const robots = { key: "X-Robots-Tag", value: ROBOTS_TAG };
  return NOINDEX_SOURCES.map((source) => ({ source, headers: [robots] }));
}
