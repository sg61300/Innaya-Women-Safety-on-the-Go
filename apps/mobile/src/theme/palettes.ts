import data from "./palettes.json";
export type PaletteKey = "midnight" | "violetBloom" | "rosePetal" | "blushLavender" | "oceanMist" | "goldenIvory" | "sakuraDawn" | "darkCherry";
export type Palette = typeof data.palettes.violetBloom;
export const PALETTE_ORDER = data.order as PaletteKey[];
export const PALETTE_META = data.meta as Record<PaletteKey, { label: string; swatch: [string, string] }>;
export const palettes = data.palettes as Record<PaletteKey, Palette>;
export const isDarkPalette = (k: PaletteKey) => k === "midnight" || k === "darkCherry";
