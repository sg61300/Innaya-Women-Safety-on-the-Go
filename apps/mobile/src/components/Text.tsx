import { Text as RNText, type TextProps } from "react-native";
import { useTheme } from "../theme";
import { TYPE, type Variant } from "../theme/typography";
type Color = "primary" | "muted" | "faint" | "onPrimary" | (string & {});
export function Text({ variant = "body", color = "primary", style, ...rest }: TextProps & { variant?: Variant; color?: Color }) {
  const { p, d } = useTheme();
  const c = color === "primary" ? p.text : color === "muted" ? p.textMuted : color === "faint" ? p.textFaint : color === "onPrimary" ? d.onPrimary : color;
  return <RNText {...rest} maxFontSizeMultiplier={1.3} style={[{ ...TYPE[variant], color: c }, style]} />;
}
