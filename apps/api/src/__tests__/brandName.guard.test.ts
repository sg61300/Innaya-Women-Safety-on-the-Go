import fs from "fs";
import path from "path";

// Brand-name guard (s29 rename VAIRA -> INNAYA, 2026-10-07).
// Fails if a user-visible brand string from the old name reappears in the
// rendered copy under apps/api/src (routes, components, libs, metadata) or in
// the web manifest.
//
// It checks TWO views of each file:
//   1. the raw source, and
//   2. a tag-stripped view (JSX/HTML tags removed) that reconstructs text split
//      across elements. This catches decorative wordmarks authored as
//      `VAIR<span>A</span>` (page.tsx footer), which a plain substring/regex scan
//      of the source misses because no contiguous "VAIRA" exists there. (That
//      exact leak was found on the campaign homepage during s29 and is why this
//      second pass exists.)
//
// Internal identifiers are intentionally NOT renamed (renaming them would break
// installed testers and sent links); they are allow-listed below and stripped
// before the check:
//   - @vaira/core, @vaira/api      workspace packages
//   - com.vaira.app                Android package
//   - vaira.app / vaira.test       live + test-fixture domains
//   - vaira.<key>                  SecureStore keys (e.g. vaira.app_password_hash)
//   - vaira-alarm-2 / -alarm / -alerts / -location   notification channels
//   - vaira-mvp.apk                CI build artifact filename
//   - vaira-b5-test-2026           tester access code
//   - vairaBand                    internal style id
//   - bare lowercase "vaira"       URL scheme / slug
//
// After stripping those, any remaining case-insensitive "vaira" is a user-visible
// regression (the brand copy was always upper/title-case "VAIRA"/"Vaira", which
// the lowercase allow-list never strips).
const SRC = path.resolve(__dirname, "..");
const MANIFEST = path.resolve(__dirname, "../../public/manifest.webmanifest");

const ALLOW: RegExp[] = [
  /@vaira\/\w+/gi,
  /com\.vaira\.app/gi,
  /vaira\.[a-z0-9_.]+/gi, // dotted keys + vaira.app + vaira.test
  /vaira-[a-z0-9-]+/gi, // channels, apk artifact, tester code
  /vairaband/gi,
  /\bvaira\b/g, // lowercase bare scheme/slug only (case-sensitive)
];

function stripAllowed(text: string): string {
  return ALLOW.reduce((t, re) => t.replace(re, " "), text);
}

// Remove JSX/HTML tags so text split across elements is reconstructed.
function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

function leaks(text: string): string[] {
  const raw = stripAllowed(text).match(/vaira/gi) ?? [];
  const joined = stripAllowed(stripTags(text)).match(/vaira/gi) ?? [];
  return [...raw, ...joined];
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "__tests__") continue; // tests are not rendered copy
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("brand name guard (apps/api rendered copy)", () => {
  const files = [...walk(SRC), MANIFEST];

  test("found rendered-copy files to scan", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  test("detector catches tag-split wordmarks", () => {
    // A split "VAIRA" like the campaign footer leak must be caught; a split
    // "INNAYA" must not trip it.
    expect(leaks("INNA<span>Y</span>A")).toEqual([]);
    expect(leaks("VAIR<span>A</span>").length).toBeGreaterThan(0);
  });

  test.each(files)("%s has no user-visible VAIRA", (file) => {
    expect(leaks(fs.readFileSync(file, "utf8"))).toEqual([]);
  });
});
