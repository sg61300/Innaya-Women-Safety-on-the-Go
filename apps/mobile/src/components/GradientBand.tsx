import { type ReactNode } from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { useTheme, type Palette } from "../theme";
import { darkenUntil } from "../theme/color";

// INNAYA v2 header band (founder b14 / products-site reference: plum-to-black
// gradients with rose-gold accents). A token-driven diagonal gradient painted
// with react-native-svg (already a dependency; no new native module). Children
// render above the gradient. Colours come from the palette brand ramp.
//
// Fix round (Fable review): text on the band is BAND_INK (white). Every stop is
// darkened with the theme's darkenUntil() until white clears WCAG 4.5:1 on it,
// so the ink passes on all 8 palettes — brandBright is pale on the dark ones
// (midnight 4.23, darkCherry 3.67 before) and brand is pale on blushLavender /
// oceanMist. A brandDeep-derived ink was measured and rejected: it lands at
// ≤2.18:1 against the mid stop on every palette. src/__tests__/GradientBand.test
// guards the ratios.
export const BAND_INK = "#FFFFFF";

export function bandStops(p: Palette, isDark: boolean): { from: string; mid: string; to: string } {
  // Light palettes: a soft brand wash (brand -> bright -> deep). Dark palettes:
  // the signature plum-to-near-black of the reference site.
  return {
    from: darkenUntil(isDark ? p.brandDeep : p.brand, BAND_INK),
    mid: darkenUntil(p.brandBright, BAND_INK),
    to: darkenUntil(isDark ? p.bgBase : p.brandDeep, BAND_INK),
  };
}

export function GradientBand({
  children, style, radius = 0, testID,
}: {
  children?: ReactNode; style?: StyleProp<ViewStyle>; radius?: number; testID?: string;
}) {
  const { p, isDark } = useTheme();
  const { from, mid, to } = bandStops(p, isDark);
  return (
    <View testID={testID} style={[{ overflow: "hidden", borderRadius: radius }, style]}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="vairaBand" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0" stopColor={from} />
            <Stop offset="0.55" stopColor={mid} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#vairaBand)" />
      </Svg>
      {children}
    </View>
  );
}
