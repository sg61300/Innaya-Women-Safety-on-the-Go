// Pre-35 item D (structural guard, per the s14 addendum — pure config wiring
// that cannot be made RED at runtime): the journey-planning screen must route
// Places autocomplete through the api proxy, never the client Maps key.
declare const __dirname: string; // provided by jest's CommonJS runtime; no @types/node in this project
const fs = require("fs");
const path = require("path");
const src: string = fs.readFileSync(path.resolve(__dirname, "../../app/(user)/journey/new.tsx"), "utf8");

test("no longer references the client-side Google Maps key", () => {
  expect(src).not.toMatch(/EXPO_PUBLIC_GOOGLE_MAPS_KEY/);
  expect(src).not.toMatch(/query=\{\{\s*key:/);
});

test("points the autocomplete requestUrl base at /api/places", () => {
  // both instances build `${process.env.EXPO_PUBLIC_API_URL}/api/places`
  const matches = src.match(/url:\s*`\$\{process\.env\.EXPO_PUBLIC_API_URL\}\/api\/places`/g) ?? [];
  expect(matches.length).toBe(2);
  expect(src).toMatch(/authorization: `Bearer \$\{accessToken\}`/);
});
