import { View } from "react-native";
import type { Button3DIcon } from "./Button3D";

// JS-only line glyphs (no react-native-svg / vector-icon native module — the
// same convention as VoiceFab/GuardianRing). Each is typed as Button3DIcon so it
// drops into Button3D, IconButton and the field/permission leading slots. Shapes
// are outlines built from bordered Views; `color` and `strokeWidth` are honoured.

type G = { size?: number; color?: string; strokeWidth?: number };
const C = (color?: string) => color ?? "#000";

export const MailGlyph: Button3DIcon = ({ size = 20, color, strokeWidth = 2 }: G) => (
  <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
    <View style={{ width: size, height: size * 0.72, borderRadius: 4, borderWidth: strokeWidth, borderColor: C(color), overflow: "hidden" }}>
      <View style={{ position: "absolute", top: -size * 0.18, left: size * 0.14, width: size * 0.5, height: size * 0.5, borderLeftWidth: strokeWidth, borderBottomWidth: strokeWidth, borderColor: C(color), transform: [{ rotate: "-45deg" }] }} />
    </View>
  </View>
);

export const PhoneGlyph: Button3DIcon = ({ size = 20, color, strokeWidth = 2 }: G) => (
  <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
    <View style={{ width: size * 0.9, height: size * 0.9, borderRadius: size * 0.28, borderWidth: strokeWidth, borderColor: C(color), transform: [{ rotate: "12deg" }] }} />
  </View>
);

export const LockGlyph: Button3DIcon = ({ size = 20, color, strokeWidth = 2 }: G) => (
  <View style={{ width: size, height: size, alignItems: "center", justifyContent: "flex-end" }}>
    <View style={{ width: size * 0.5, height: size * 0.44, borderTopLeftRadius: size * 0.28, borderTopRightRadius: size * 0.28, borderWidth: strokeWidth, borderBottomWidth: 0, borderColor: C(color), marginBottom: -strokeWidth }} />
    <View style={{ width: size * 0.82, height: size * 0.5, borderRadius: 3, borderWidth: strokeWidth, borderColor: C(color) }} />
  </View>
);

export const EyeGlyph: Button3DIcon = ({ size = 20, color, strokeWidth = 2 }: G) => (
  <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
    <View style={{ width: size, height: size * 0.62, borderRadius: size * 0.31, borderWidth: strokeWidth, borderColor: C(color), alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: size * 0.26, height: size * 0.26, borderRadius: size * 0.13, backgroundColor: C(color) }} />
    </View>
  </View>
);

export const EyeOffGlyph: Button3DIcon = ({ size = 20, color, strokeWidth = 2 }: G) => (
  <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
    <View style={{ width: size, height: size * 0.62, borderRadius: size * 0.31, borderWidth: strokeWidth, borderColor: C(color) }} />
    <View style={{ position: "absolute", width: size * 1.18, height: strokeWidth, backgroundColor: C(color), transform: [{ rotate: "-45deg" }] }} />
  </View>
);

export const MicGlyph: Button3DIcon = ({ size = 20, color, strokeWidth = 2 }: G) => (
  <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
    <View style={{ width: size * 0.4, height: size * 0.6, borderRadius: size * 0.2, backgroundColor: C(color) }} />
    <View style={{ width: size * 0.7, height: size * 0.35, borderBottomLeftRadius: size * 0.35, borderBottomRightRadius: size * 0.35, borderWidth: strokeWidth, borderTopWidth: 0, borderColor: C(color), marginTop: -size * 0.18 }} />
    <View style={{ width: strokeWidth, height: size * 0.16, backgroundColor: C(color) }} />
  </View>
);

export const MapPinGlyph: Button3DIcon = ({ size = 20, color, strokeWidth = 2 }: G) => (
  <View style={{ width: size, height: size, alignItems: "center", justifyContent: "flex-start" }}>
    <View style={{ width: size * 0.72, height: size * 0.72, borderRadius: size * 0.36, borderTopRightRadius: size * 0.36, borderWidth: strokeWidth, borderColor: C(color), transform: [{ rotate: "45deg" }], alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: size * 0.24, height: size * 0.24, borderRadius: size * 0.12, backgroundColor: C(color), transform: [{ rotate: "-45deg" }] }} />
    </View>
  </View>
);

export const CameraGlyph: Button3DIcon = ({ size = 20, color, strokeWidth = 2 }: G) => (
  <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
    <View style={{ width: size, height: size * 0.72, borderRadius: 4, borderWidth: strokeWidth, borderColor: C(color), alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: size * 0.34, height: size * 0.34, borderRadius: size * 0.17, borderWidth: strokeWidth, borderColor: C(color) }} />
    </View>
  </View>
);

export const BellGlyph: Button3DIcon = ({ size = 20, color, strokeWidth = 2 }: G) => (
  <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
    <View style={{ width: size * 0.72, height: size * 0.6, borderTopLeftRadius: size * 0.36, borderTopRightRadius: size * 0.36, borderWidth: strokeWidth, borderBottomWidth: 0, borderColor: C(color) }} />
    <View style={{ width: size * 0.9, height: strokeWidth, backgroundColor: C(color) }} />
    <View style={{ width: size * 0.18, height: size * 0.18, borderRadius: size * 0.09, borderWidth: strokeWidth, borderColor: C(color), marginTop: 1 }} />
  </View>
);

export const BatteryGlyph: Button3DIcon = ({ size = 20, color, strokeWidth = 2 }: G) => (
  <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", flexDirection: "row" }}>
    <View style={{ width: size * 0.82, height: size * 0.5, borderRadius: 3, borderWidth: strokeWidth, borderColor: C(color) }} />
    <View style={{ width: strokeWidth + 1, height: size * 0.2, borderTopRightRadius: 2, borderBottomRightRadius: 2, backgroundColor: C(color) }} />
  </View>
);

export const GoogleGlyph: Button3DIcon = ({ size = 20, color, strokeWidth = 2 }: G) => (
  <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
    <View style={{ width: size * 0.8, height: size * 0.8, borderRadius: size * 0.4, borderWidth: strokeWidth, borderColor: C(color), borderRightColor: "transparent" }} />
    <View style={{ position: "absolute", right: size * 0.08, top: size * 0.42, width: size * 0.36, height: strokeWidth, backgroundColor: C(color) }} />
  </View>
);
