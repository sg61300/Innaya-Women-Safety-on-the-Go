import { TYPE, FONT, LOADED_FONT_NAMES, fontFamilyFor, type Variant, type Script } from "../typography";

const VARIANTS: Variant[] = ["display", "displaySerif", "title", "titleSerif", "subtitle", "body", "bodyStrong", "caption", "label", "chip", "numeral"];
const SCRIPTS: Script[] = ["latin", "hi", "kn"];
// The removed faces: Inter, Plus Jakarta Sans, and the old platform serif
// tokens ("Georgia"/bare "serif"). NotoSerifDevanagari is a legit new face.
const BANNED = [/^Inter_/, /^PlusJakarta/, /^Georgia$/, /^serif$/];

test("scale respects the minimums", () => {
  expect(TYPE.body.fontSize).toBeGreaterThanOrEqual(16);
  expect(TYPE.caption.fontSize).toBeGreaterThanOrEqual(13);
  expect(TYPE.numeral.fontSize).toBeGreaterThanOrEqual(64);
});

test("default (latin) variants resolve to the loaded Spectral / Work Sans faces", () => {
  expect(TYPE.display.fontFamily).toBe(FONT.display); // Spectral_600SemiBold
  expect(TYPE.body.fontFamily).toBe(FONT.body); // WorkSans_400Regular
  expect(TYPE.numeral.fontFamily).toBe(FONT.numeral); // Spectral_700Bold
});

test("every variant resolves to a LOADED font family in every script, none banned", () => {
  for (const s of SCRIPTS) {
    for (const v of VARIANTS) {
      const fam = fontFamilyFor(v, s);
      expect(LOADED_FONT_NAMES).toContain(fam);
      for (const b of BANNED) expect(fam).not.toMatch(b);
    }
  }
});

test("hi/kn headings use Noto, kn falls back to Kannada for serif", () => {
  expect(fontFamilyFor("display", "hi")).toBe("NotoSerifDevanagari_600SemiBold");
  expect(fontFamilyFor("body", "hi")).toBe("NotoSansDevanagari_400Regular");
  expect(fontFamilyFor("display", "kn")).toBe("NotoSansKannada_700Bold");
  expect(fontFamilyFor("body", "kn")).toBe("NotoSansKannada_400Regular");
});
