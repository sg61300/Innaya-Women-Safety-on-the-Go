// Brand-name guard (s29 rename VAIRA -> INNAYA, 2026-10-07).
// Fails if a user-visible brand string from the old name reappears in the
// i18n copy. The i18n JSON holds display strings only (no identifiers), so any
// case-insensitive "vaira" here is a regression. Internal identifiers (the
// "vaira" URL scheme, SecureStore "vaira.*" keys, @vaira/* packages,
// "vaira-alarm*" channels) live in code, not in these JSON files, and are
// intentionally NOT renamed.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path");
declare const __dirname: string; // provided by jest's CommonJS runtime; no @types/node in this project

const I18N = path.join(__dirname, "..", "i18n");

describe("brand name guard (i18n copy)", () => {
  const files: string[] = fs
    .readdirSync(I18N)
    .filter((f: string) => f.endsWith(".json"));

  test("i18n dir has the expected locale files", () => {
    expect(files.slice().sort()).toEqual(["en.json", "hi.json", "kn.json"]);
  });

  for (const file of files) {
    test(`${file} has no VAIRA brand string`, () => {
      const text: string = fs.readFileSync(path.join(I18N, file), "utf8");
      const hits = text.match(/vaira/gi) ?? [];
      expect(hits).toEqual([]);
    });
  }
});
