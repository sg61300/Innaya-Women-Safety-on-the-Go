import { Image, type ImageStyle, type StyleProp } from "react-native";
import { ILLUSTRATION_FILES } from "../../assets/illustrations/illustrations.generated";

// F-illustrations (founder 2026-09-07): the app should feel visual, with soft-3D
// rose-gold/plum renders wherever possible. Files land in assets/illustrations/
// as <key>.webp and are picked up by scripts/illustrations-map.mjs. Until a key's
// file exists, <Illustration/> shows the brand emblem so every slot renders now.
const emblem = require("../../assets/brand/emblem.png");

// The full slot vocabulary (stable filenames the founder generates against). A
// name with no file yet simply renders the emblem fallback.
export type IllustrationName =
  | "selfdefence-hero"
  | "tool-pepper-spray" | "tool-personal-alarm" | "tool-whistle" | "tool-safety-phone"
  | "class-selfdefence" | "class-map-pin"
  | "simulate-drill" | "simulate-golive" | "simulate-videocall"
  | "regions-empty" | "journey-plan" | "consent-disclaimer"
  | "guardians" | "vitals";

export function Illustration({ name, size = 72, style, testID }: { name: IllustrationName; size?: number; style?: StyleProp<ImageStyle>; testID?: string }) {
  const source = ILLUSTRATION_FILES[name] ?? emblem;
  return (
    <Image
      testID={testID}
      source={source}
      accessibilityIgnoresInvertColors
      accessibilityRole="image"
      style={[{ width: size, height: size, resizeMode: "contain" }, style]}
    />
  );
}
