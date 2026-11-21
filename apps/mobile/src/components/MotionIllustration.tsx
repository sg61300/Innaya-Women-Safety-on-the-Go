import { useEffect } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, cancelAnimation, Easing } from "react-native-reanimated";
import { Illustration, type IllustrationName } from "./Illustration";
import { useTheme } from "../theme";
import { MOTION } from "../lib/motion";

// Lightweight, library-free in-app motions (Reanimated only, no Skia) so the
// screens that render them stay green in jest. All amounts/speeds come from the
// single MOTION constants file. `active` gates the loop: when false (screen not
// visible OR reduce motion on) the view rests on its still state.
//
//  - "pin"    P3 unsafe-regions pin: bobs up/down AND breathes together.
//  - "breathe" P16 safety phone: gentle scale breath.
//  - "pulse"  P14 personal alarm: a ring of light pulses outward over the centre
//             button so it reads as an alarm going off.
type Variant = "pin" | "breathe" | "pulse";

export function MotionIllustration({ name, size, variant, active, style, testID }: {
  name: IllustrationName; size: number; variant: Variant; active: boolean;
  style?: StyleProp<ViewStyle>; testID?: string;
}) {
  const { p } = useTheme();
  const phase = useSharedValue(0); // 0..1 breathing/bob driver
  const ring = useSharedValue(0); // 0..1 pulse-ring driver

  useEffect(() => {
    if (!active) { cancelAnimation(phase); cancelAnimation(ring); phase.value = 0; ring.value = 0; return; }
    if (variant === "pulse") {
      ring.value = withRepeat(withTiming(1, { duration: MOTION.alarmPulse.periodMs, easing: Easing.out(Easing.ease) }), -1, false);
    } else {
      const period = variant === "pin" ? MOTION.pin.periodMs : MOTION.safetyPhone.periodMs;
      // a full breath = up then back, so each half is period/2.
      phase.value = withRepeat(withSequence(
        withTiming(1, { duration: period / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: period / 2, easing: Easing.inOut(Easing.ease) }),
      ), -1, false);
    }
    return () => { cancelAnimation(phase); cancelAnimation(ring); };
  }, [active, variant, phase, ring]);

  const imgStyle = useAnimatedStyle(() => {
    if (variant === "pin") {
      const s = MOTION.pin.scaleMin + (MOTION.pin.scaleMax - MOTION.pin.scaleMin) * phase.value;
      return { transform: [{ translateY: -MOTION.pin.bobPx * phase.value }, { scale: s }] };
    }
    if (variant === "breathe") {
      const s = MOTION.safetyPhone.scaleMin + (MOTION.safetyPhone.scaleMax - MOTION.safetyPhone.scaleMin) * phase.value;
      return { transform: [{ scale: s }] };
    }
    return {};
  });

  const ringStyle = useAnimatedStyle(() => {
    const t = ring.value;
    const s = MOTION.alarmPulse.ringStartScale + (MOTION.alarmPulse.ringEndScale - MOTION.alarmPulse.ringStartScale) * t;
    return { opacity: MOTION.alarmPulse.opacityStart * (1 - t), transform: [{ scale: s }] };
  });

  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]} testID={testID}>
      {variant === "pulse" ? (
        <Animated.View
          pointerEvents="none"
          style={[{ position: "absolute", width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: p.stateDanger }, ringStyle]}
        />
      ) : null}
      <Animated.View style={imgStyle}>
        <Illustration name={name} size={size} />
      </Animated.View>
    </View>
  );
}
