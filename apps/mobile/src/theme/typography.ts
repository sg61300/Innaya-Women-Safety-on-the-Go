import { useFonts, Spectral_600SemiBold, Spectral_700Bold } from "@expo-google-fonts/spectral";
import { WorkSans_400Regular, WorkSans_500Medium, WorkSans_600SemiBold, WorkSans_700Bold } from "@expo-google-fonts/work-sans";
import { NotoSerifDevanagari_600SemiBold } from "@expo-google-fonts/noto-serif-devanagari";
import { NotoSansDevanagari_400Regular, NotoSansDevanagari_600SemiBold } from "@expo-google-fonts/noto-sans-devanagari";
import { NotoSansKannada_400Regular, NotoSansKannada_600SemiBold, NotoSansKannada_700Bold } from "@expo-google-fonts/noto-sans-kannada";
import i18n from "../i18n";

// s25 (founder ruling, candidate 8): Spectral (serif display/titles) + Work Sans
// (sans body). hi/kn keep the bundled Noto faces because Spectral/Work Sans have
// no Indic coverage. Only the weights the scale uses are loaded; 700 is reserved
// for the numeral and true emphasis, not a blanket bold.

export type Variant = "display" | "displaySerif" | "title" | "titleSerif" | "subtitle" | "body" | "bodyStrong" | "caption" | "label" | "chip" | "numeral";

// The exact font assets registered with expo-font. The guard test asserts every
// TYPE variant resolves to one of these keys.
const ASSETS = {
  Spectral_600SemiBold,
  Spectral_700Bold,
  WorkSans_400Regular,
  WorkSans_500Medium,
  WorkSans_600SemiBold,
  WorkSans_700Bold,
  NotoSerifDevanagari_600SemiBold,
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_600SemiBold,
  NotoSansKannada_400Regular,
  NotoSansKannada_600SemiBold,
  NotoSansKannada_700Bold,
} as const;

export const LOADED_FONT_NAMES: readonly string[] = Object.keys(ASSETS);

// Latin (default) family names. Kept as the module's single source of truth for
// the en scale and for any code that reads FONT.* directly.
export const FONT = {
  body: "WorkSans_400Regular",
  bodyMedium: "WorkSans_500Medium",
  bodySemi: "WorkSans_600SemiBold",
  bodyBold: "WorkSans_700Bold",
  display: "Spectral_600SemiBold",
  serif: "Spectral_600SemiBold",
  numeral: "Spectral_700Bold",
} as const;

export type Script = "latin" | "hi" | "kn";
function currentScript(): Script {
  const l = i18n.language;
  return l === "hi" ? "hi" : l === "kn" ? "kn" : "latin";
}

type SansWeight = 400 | 500 | 600 | 700;
type Role = { kind: "serif" } | { kind: "sans"; weight: SansWeight } | { kind: "numeral" };

// Weight / family plan from the candidate-8 ruling: display & titles -> Spectral
// 600; subtitle 600, body 400, strong 600; caption 500, label 600, chip 700;
// numeral -> Spectral 700.
const ROLE: Record<Variant, Role> = {
  display: { kind: "serif" },
  displaySerif: { kind: "serif" },
  title: { kind: "serif" },
  titleSerif: { kind: "serif" },
  subtitle: { kind: "sans", weight: 600 },
  body: { kind: "sans", weight: 400 },
  bodyStrong: { kind: "sans", weight: 600 },
  caption: { kind: "sans", weight: 500 },
  label: { kind: "sans", weight: 600 },
  chip: { kind: "sans", weight: 700 },
  numeral: { kind: "numeral" },
};

// Serif / display role. kn bundles no serif face -> Noto Sans Kannada 700.
function serifFamily(script: Script): string {
  if (script === "hi") return "NotoSerifDevanagari_600SemiBold";
  if (script === "kn") return "NotoSansKannada_700Bold";
  return "Spectral_600SemiBold";
}

// Sans / body role. Noto Devanagari bundles 400/600 only (500->400, 700->600);
// Noto Kannada bundles 400/600/700 (500->400).
function sansFamily(script: Script, weight: SansWeight): string {
  if (script === "hi") return weight >= 600 ? "NotoSansDevanagari_600SemiBold" : "NotoSansDevanagari_400Regular";
  if (script === "kn") return weight >= 700 ? "NotoSansKannada_700Bold" : weight >= 600 ? "NotoSansKannada_600SemiBold" : "NotoSansKannada_400Regular";
  if (weight === 700) return "WorkSans_700Bold";
  if (weight === 600) return "WorkSans_600SemiBold";
  if (weight === 500) return "WorkSans_500Medium";
  return "WorkSans_400Regular";
}

// Resolve the font family for a variant under a given script. Exported so the
// guard test checks every (variant, script) pair deterministically.
export function fontFamilyFor(variant: Variant, script: Script): string {
  const role = ROLE[variant];
  if (role.kind === "numeral") return "Spectral_700Bold"; // digits: locale-independent
  if (role.kind === "serif") return serifFamily(script);
  return sansFamily(script, role.weight);
}

type Style = { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing?: number; textTransform?: "uppercase"; fontVariant?: ["tabular-nums"] };

const SIZE: Record<Variant, Omit<Style, "fontFamily">> = {
  display: { fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  displaySerif: { fontSize: 30, lineHeight: 36, letterSpacing: -0.3 },
  titleSerif: { fontSize: 22, lineHeight: 28 },
  title: { fontSize: 22, lineHeight: 28 },
  subtitle: { fontSize: 17, lineHeight: 24 },
  body: { fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontSize: 16, lineHeight: 24 },
  caption: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
  chip: { fontSize: 11, lineHeight: 14, letterSpacing: 0.4, textTransform: "uppercase" },
  numeral: { fontSize: 64, lineHeight: 68, fontVariant: ["tabular-nums"] },
};

// fontFamily is a getter so it tracks the active language. Consumers read it at
// render (Text spreads {...TYPE[variant]}) and ThemeProvider re-renders on
// languageChanged, so hi/kn pick up the Noto faces without touching any screen.
function makeVariant(v: Variant): Style {
  const base = SIZE[v] as Style;
  Object.defineProperty(base, "fontFamily", { enumerable: true, get: () => fontFamilyFor(v, currentScript()) });
  return base;
}

export const TYPE: Record<Variant, Style> = {
  display: makeVariant("display"),
  displaySerif: makeVariant("displaySerif"),
  titleSerif: makeVariant("titleSerif"),
  title: makeVariant("title"),
  subtitle: makeVariant("subtitle"),
  body: makeVariant("body"),
  bodyStrong: makeVariant("bodyStrong"),
  caption: makeVariant("caption"),
  label: makeVariant("label"),
  chip: makeVariant("chip"),
  numeral: makeVariant("numeral"),
};

export function useAppFonts(): boolean {
  const [loaded] = useFonts(ASSETS);
  return loaded;
}
