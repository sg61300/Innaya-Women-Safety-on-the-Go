import { Image, type ImageStyle, type StyleProp } from "react-native";
import type { Button3DIcon } from "./Button3D";

// VAIRA v2 raster icon set (founder b14). The sliced, halo-cleaned rose-gold +
// plum icons in assets/icons/. Metro needs static require() literals, so the map
// is spelled out. These are brand-coloured artwork (not monochrome glyphs), so
// they are NOT tinted — the palette already lives in the artwork.
const ICONS = {
  home: require("../../assets/icons/home.webp"),
  regions: require("../../assets/icons/regions.webp"),
  sos: require("../../assets/icons/sos.webp"),
  simulate: require("../../assets/icons/simulate.webp"),
  profile: require("../../assets/icons/profile.webp"),
  call: require("../../assets/icons/call.webp"),
  video: require("../../assets/icons/video.webp"),
  mic: require("../../assets/icons/mic.webp"),
  bell: require("../../assets/icons/bell.webp"),
  details: require("../../assets/icons/details.webp"),
  guardians: require("../../assets/icons/guardians.webp"),
  password: require("../../assets/icons/password.webp"),
  language: require("../../assets/icons/language.webp"),
  palette: require("../../assets/icons/palette.webp"),
  privacy: require("../../assets/icons/privacy.webp"),
  logout: require("../../assets/icons/logout.webp"),
  report: require("../../assets/icons/report.webp"),
  risk: require("../../assets/icons/risk.webp"),
} as const;

export type AppIconName = keyof typeof ICONS;

export function AppIcon({ name, size = 28, style, testID }: { name: AppIconName; size?: number; style?: StyleProp<ImageStyle>; testID?: string }) {
  return (
    <Image
      testID={testID}
      source={ICONS[name]}
      accessibilityIgnoresInvertColors
      accessibilityRole="image"
      style={[{ width: size, height: size, resizeMode: "contain" }, style]}
    />
  );
}

// R3: adapters so the raster set drops into the Field/Button3D `icon` slot
// (Button3DIcon signature). color/strokeWidth are ignored — the palette lives in
// the artwork. Module-level so they keep a stable identity (no per-keystroke
// remount of the <Image>). Only the icons with a real match are exposed:
// password -> lock field, call -> phone field. Mail has no match in the set.
export const LockAppIcon: Button3DIcon = ({ size = 20 }) => <AppIcon name="password" size={size} />;
export const PhoneAppIcon: Button3DIcon = ({ size = 20 }) => <AppIcon name="call" size={size} />;
