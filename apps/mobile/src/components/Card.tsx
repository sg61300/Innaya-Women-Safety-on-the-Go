import { type ReactNode } from "react";
import { View, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { elevation, hairline, type ElevationLevel } from "../theme/elevation";

// VAIRA v2 card system (founder b14). Three variants:
//  - "flat"   : token border, no shadow (dense lists, tiles). Default, so every
//               existing <Card/> keeps its exact look.
//  - "raised" : soft drop shadow, for content cards that should lift off the page.
//  - "hero"   : deep shadow + 1px rose-gold hairline, for the marquee card on a
//               screen (journey, self-defence hero, etc.).
// All colours come from tokens; nothing is hard-coded per palette.
export function Card({
  children, style, onPress, testID, variant = "flat", accessibilityLabel,
}: {
  children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string;
  variant?: ElevationLevel; accessibilityLabel?: string;
}) {
  const { p, d, isDark } = useTheme();
  const border = variant === "hero" ? hairline(p, isDark) : d.card.border;
  const base: ViewStyle = {
    backgroundColor: d.card.bg, borderColor: border, borderWidth: 1, borderRadius: 20, padding: 16,
    ...elevation(variant, p, isDark),
  };
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} testID={testID} onPress={onPress}
        style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View testID={testID} style={[base, style]}>{children}</View>;
}
