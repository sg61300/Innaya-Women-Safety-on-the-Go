import { useEffect } from "react";
import { View, Image, type ImageSourcePropType } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { useTheme } from "../theme";
import { Text } from "./Text";
import i18n from "../i18n";

// F3/D13: guardian count copy is shared with JourneyCard via one pair of plural
// keys; the count is selected explicitly (count === 1) so it does not depend on
// the i18next plural backend being configured.
export function guardiansLabel(count: number): string {
  return i18n.t(count === 1 ? "home.guardiansCount_one" : "home.guardiansCount_other", { count });
}

export type RingState = "idle" | "safe" | "amber" | "emergency" | "critical";
const LABEL: Record<RingState, string> = { idle: "STANDBY", safe: "SAFE", amber: "AMBER", emergency: "EMERGENCY", critical: "CRITICAL" };

// JS-only ring (no react-native-svg native module). Concentric bordered Views
// stand in for the SVG arcs; the coloured borders read as spinning arcs, and a
// dashed ring approximates the 24 tick marks. Reanimated drives the rotation.
export function GuardianRing({ state, guardians, size = 210, emblem, reduceMotion = false }: {
  state: RingState; guardians: number; size?: number; emblem: ImageSourcePropType; reduceMotion?: boolean;
}) {
  const { d } = useTheme();
  const c = d.ring.stateColor[state];
  const cx = size / 2;
  const dOuter = size * 0.8, dInner = size * 0.648, dTick = size * 0.86, dFaint = size * 0.856;
  const rot = useSharedValue(0), rotIn = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    rot.value = withRepeat(withTiming(360, { duration: 5000, easing: Easing.linear }), -1);
    rotIn.value = withRepeat(withTiming(-360, { duration: 8000, easing: Easing.linear }), -1);
  }, [reduceMotion, rot, rotIn]);
  const outerStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  const innerStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotIn.value}deg` }] }));
  const ring = (dia: number): object => ({ position: "absolute", width: dia, height: dia, borderRadius: dia / 2 });
  const dots = Array.from({ length: 8 }, (_, i) => {
    const a = (i * 45 - 90) * Math.PI / 180, r = size * 0.476, dot = 5;
    return { key: i, left: cx + r * Math.cos(a) - dot / 2, top: cx + r * Math.sin(a) - dot / 2, o: 0.3 + (i % 3) * 0.15, size: dot };
  });
  return (
    <View testID="guardian-ring" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={[ring(dFaint), { borderWidth: 1.5, borderColor: "rgba(127,127,127,0.12)" }]} />
      <View style={[ring(dTick), { borderWidth: 2, borderStyle: "dashed", borderColor: c, opacity: 0.28 }]} />
      {dots.map(p => (
        <View key={p.key} style={{ position: "absolute", left: p.left, top: p.top, width: p.size, height: p.size, borderRadius: p.size / 2, backgroundColor: c, opacity: p.o }} />
      ))}
      <Animated.View style={[ring(dOuter), { borderWidth: 2.5, borderColor: "transparent", borderTopColor: c, borderRightColor: c, opacity: 0.6 }, outerStyle]} />
      <Animated.View style={[ring(dInner), { borderWidth: 1.5, borderColor: "transparent", borderLeftColor: c, borderBottomColor: c, opacity: 0.4 }, innerStyle]} />
      <View style={{ width: size * 0.6, height: size * 0.6, borderRadius: size * 0.3, backgroundColor: d.ring.disc, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(127,127,127,0.15)" }}>
        <Image source={emblem} style={{ width: size / 4, height: size / 4, resizeMode: "contain" }} accessibilityIgnoresInvertColors />
        <Text variant="label" color={d.ring.label} accessibilityLabel={`Safety status: ${LABEL[state]}`} style={{ marginTop: 6 }}>{LABEL[state]}</Text>
        <Text variant="caption" color={d.ring.sub}>{guardiansLabel(guardians)}</Text>
      </View>
    </View>
  );
}
