import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { palettes, isDarkPalette, type PaletteKey, type Palette } from "./palettes";
import { deriveTokens, type DerivedTokens } from "./derive";
import i18n from "../i18n";
export type Choice = PaletteKey | "system";
export type Theme = { palette: PaletteKey; isDark: boolean; p: Palette; d: DerivedTokens; choice: Choice; setPalette: (c: Choice) => Promise<void> };
const KEY = "vaira.palette";
const Ctx = createContext<Theme | null>(null);
export function ThemeProvider({ children, initial = "system" }: { children: React.ReactNode; initial?: Choice }) {
  const [choice, setChoice] = useState<Choice>(initial);
  const [languageRevision, setLanguageRevision] = useState(0);
  useEffect(() => { AsyncStorage.getItem(KEY).then(v => { if (v) setChoice(v as Choice); }).catch(() => {}); }, []);
  useEffect(() => {
    const onLanguageChanged = () => setLanguageRevision((n) => n + 1);
    i18n.on("languageChanged", onLanguageChanged);
    return () => { i18n.off("languageChanged", onLanguageChanged); };
  }, []);
  const value = useMemo<Theme>(() => {
    // Founder ruling 2026-10-09: INNAYA ships a single deep-plum dark identity.
    // "system" (the default) resolves to the deep-plum palette regardless of the
    // OS appearance, so the rose-gold mark keeps ~7:1 contrast on every screen.
    // Explicit palette choices from the picker still switch as before.
    const palette: PaletteKey = choice === "system" ? "midnight" : choice;
    const isDark = isDarkPalette(palette); const p = palettes[palette];
    return { palette, isDark, p, d: deriveTokens(p, isDark), choice,
      setPalette: async (c) => { setChoice(c); try { await AsyncStorage.setItem(KEY, c); } catch (e) { console.warn("[theme] persist failed", e); } console.log("[theme] palette", c); } };
  }, [choice, languageRevision]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useTheme(): Theme { const t = useContext(Ctx); if (!t) throw new Error("useTheme outside ThemeProvider"); return t; }
