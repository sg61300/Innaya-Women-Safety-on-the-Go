import { Platform, type ViewStyle } from "react-native";
import { parseColor } from "./color";
import type { Palette } from "./palettes";

// VAIRA v2 elevation (founder b14: "make them designful, elegant, polished").
// The palette ships shadow tokens as CSS strings ("0 4px 18px rgba(...)") which
// React Native cannot consume, so this maps the three tiers to native shadow
// props (iOS shadow* + Android elevation). The shadow colour is derived from the
// palette: the deep brand ink in light palettes, near-black in dark ones, so the
// glow reads as a soft plum drop rather than a grey box in every theme.
export type ElevationLevel = "flat" | "raised" | "hero";

function shadowColor(p: Palette, isDark: boolean): string {
  // brandDeep is the darkest brand ink (e.g. #4C1D95); dark palettes want the
  // page ink (#0C0A1E) so the shadow stays invisible-until-lifted.
  return isDark ? p.bgBase : p.brandDeep;
}

// iOS reads shadowOpacity/Radius/Offset; Android reads elevation only. We set
// both so a card lifts on either platform. Opacity is intentionally low in light
// (soft glow) and a touch higher in dark (needs more separation on near-black).
export function elevation(level: ElevationLevel, p: Palette, isDark: boolean): ViewStyle {
  if (level === "flat") return {};
  const color = shadowColor(p, isDark);
  const raised = {
    ios: { shadowColor: color, shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.5 : 0.06, shadowRadius: 12 },
    android: { elevation: 4, shadowColor: color },
  };
  const hero = {
    ios: { shadowColor: color, shadowOffset: { width: 0, height: 10 }, shadowOpacity: isDark ? 0.6 : 0.2, shadowRadius: 28 },
    android: { elevation: 10, shadowColor: color },
  };
  const spec = level === "hero" ? hero : raised;
  return Platform.OS === "android" ? spec.android : spec.ios;
}

// A 1px rose-gold hairline that reads on both themes: the warm rose accent at low
// alpha in light, a brighter rose at higher alpha in dark (near-black eats it).
export function hairline(p: Palette, isDark: boolean): string {
  const { r, g, b } = parseColor(p.rose); // palette rose accent token, low alpha
  return `rgba(${r},${g},${b},${isDark ? 0.22 : 0.16})`;
}
