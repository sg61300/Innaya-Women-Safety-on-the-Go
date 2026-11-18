import { useEffect } from "react";
import { View, Image, type ImageSourcePropType } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, cancelAnimation, Easing } from "react-native-reanimated";
import { Canvas, Circle, RadialGradient, Blur, vec } from "@shopify/react-native-skia";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { guardiansLabel, type RingState } from "./GuardianRing";
import { useScreenFocused } from "../lib/useMotionActive";
import { MOTION } from "../lib/motion";

// Founder 2026-10-12: replace the GuardianRing on Home with this medallion. The
// dashed ring, rotating arcs and guardian dots are REMOVED; what remains is the
// brand emblem breathing (a gentle swell) over a REAL blurred radial light pool in
// the current safety-state colour (drawn with @shopify/react-native-skia, already
// a dependency), with the state label and the "N guardian(s)" count kept. The
// medallion only DISPLAYS the state passed in — no safety logic lives here.
//
// Performance: Skia draws the glow ONCE (a static radial gradient + blur); the
// breath is just opacity + scale on the wrapping Animated.View, handled by the
// native compositor, so Skia does not re-render per frame. The breath STOPS (glow
// sits static at its rest opacity) when reduceMotion is on OR the screen is not
// focused (off-screen / backgrounded).
const LABEL: Record<RingState, string> = { idle: "STANDBY", safe: "SAFE", amber: "AMBER", emergency: "EMERGENCY", critical: "CRITICAL" };

// Edge colour for the radial gradient: the same hue at zero alpha so the glow fades
// out cleanly (no dark halo). Falls back to the colour itself for non-#RRGGBB input.
function fade(hex: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}00` : hex;
}

export function StatusMedallion({ state, guardians, emblem, size = 200, reduceMotion = false }: {
  state: RingState; guardians: number; emblem: ImageSourcePropType; size?: number; reduceMotion?: boolean;
}) {
  const { d } = useTheme();
  const c = d.ring.stateColor[state];
  const focused = useScreenFocused();
  const active = focused && !reduceMotion;
  const phase = useSharedValue(0); // 0..1 breathing driver

  useEffect(() => {
    if (!active) { cancelAnimation(phase); phase.value = 0; return; }
    const period = MOTION.medallion.periodMs[state] ?? MOTION.medallion.periodMs.idle;
    // a full breath = up then back, so each half is period/2.
    phase.value = withRepeat(withSequence(
      withTiming(1, { duration: period / 2, easing: Easing.inOut(Easing.ease) }),
      withTiming(0, { duration: period / 2, easing: Easing.inOut(Easing.ease) }),
    ), -1, false);
    return () => { cancelAnimation(phase); };
  }, [active, state, phase]);

  const swellStyle = useAnimatedStyle(() => {
    const m = MOTION.medallion;
    return { transform: [{ scale: m.scaleMin + (m.scaleMax - m.scaleMin) * phase.value }] };
  });
  const poolStyle = useAnimatedStyle(() => {
    const m = MOTION.medallion;
    return {
      opacity: m.poolOpacityMin + (m.poolOpacityMax - m.poolOpacityMin) * phase.value,
      transform: [{ scale: m.poolScaleMin + (m.poolScaleMax - m.poolScaleMin) * phase.value }],
    };
  });

  const pool = size * 0.82;
  return (
    <View testID="status-medallion" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", width: pool, height: pool }, poolStyle]}>
        <Canvas style={{ width: pool, height: pool }}>
          <Circle cx={pool / 2} cy={pool / 2} r={pool / 2}>
            <RadialGradient c={vec(pool / 2, pool / 2)} r={pool / 2} colors={[c, fade(c)]} />
            <Blur blur={pool * 0.06} />
          </Circle>
        </Canvas>
      </Animated.View>
      <Animated.View style={swellStyle}>
        <Image source={emblem} style={{ width: size * 0.4, height: size * 0.4, resizeMode: "contain" }} accessibilityIgnoresInvertColors />
      </Animated.View>
      <Text variant="label" color={d.ring.label} accessibilityLabel={`Safety status: ${LABEL[state]}`} style={{ marginTop: 10 }}>{LABEL[state]}</Text>
      <Text variant="caption" color={d.ring.sub}>{guardiansLabel(guardians)}</Text>
    </View>
  );
}
